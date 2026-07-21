/**
 * Quick smoke test for the OCR recipe extraction pipeline.
 * Run with:  npx tsx test-ocr.ts [path/to/photo.jpg]
 * Defaults to fixtures/recipe-print.jpg; fixtures/recipe-hard.jpg should FAIL the gate.
 *
 * Runs fully offline: preprocess → tesseract OCR → quality gate → local parser.
 * If GEMINI_API_KEY is set in .env.local, additionally runs the OCR text through
 * the Gemini structuring prompt (dev-only key — the app itself uses per-user keys).
 */

import { readFileSync } from 'fs';
import path from 'path';

// Load .env.local manually
try {
  const envPath = path.join(process.cwd(), '.env.local');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (key) process.env[key] = value;
    }
  }
} catch {
  // .env.local not found — rely on env vars already set
}

import { getOcrEngine, preprocessForOcr, assessOcrQuality } from './api/_utils/ocr.js';
import { parseRecipeText } from './api/_utils/recipeParsers.js';

const imagePath = process.argv[2] ?? 'fixtures/recipe-print.jpg';
console.log(`OCR smoke test: ${imagePath}\n`);

const image = readFileSync(imagePath);

const t0 = Date.now();
const preprocessed = await preprocessForOcr(image);
console.log(`Preprocess: ${Date.now() - t0}ms (${(preprocessed.length / 1024).toFixed(0)} KB PNG)`);

const t1 = Date.now();
const result = await getOcrEngine().recognize(preprocessed);
console.log(`OCR: ${Date.now() - t1}ms`);

const text = result.text.trim();
const nonWs = text.replace(/\s/g, '').length;
const letters = (text.match(/[A-Za-z]/g) ?? []).length;
console.log(`Confidence: ${result.confidence.toFixed(1)}`);
console.log(`Characters: ${text.length}, alpha ratio: ${nonWs ? (letters / nonWs).toFixed(2) : 'n/a'}`);

const gate = assessOcrQuality(result);
console.log(`Quality gate: ${gate.ok ? 'PASS' : `FAIL (${gate.reason})`}\n`);

console.log('── OCR text (first 40 lines) ──');
console.log(text.split('\n').slice(0, 40).join('\n'));
console.log('───────────────────────────────\n');

if (gate.ok) {
  console.log('── Local parser output ──');
  console.log(JSON.stringify(parseRecipeText(text), null, 2));
}

const apiKey = process.env.GEMINI_API_KEY;
if (gate.ok && apiKey) {
  console.log('\n── Gemini text structuring (gemini-3.1-flash-lite) ──');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.1-flash-lite',
    systemInstruction:
      'You are a recipe extraction assistant. You are given raw OCR text scanned from a photo of a recipe (cookbook page, recipe card, or printout). Structure it and return ONLY a valid JSON object — no markdown, no explanation, no code fences.',
  });
  const prompt = `Structure this OCR text of a recipe into JSON with fields title, source, servings, prepTime, totalTime, ingredientSections (title + ingredients with name/quantity/unit/originalText), steps. Keep originalText and steps verbatim.\n\nOCR text:\n${text.slice(0, 20_000)}`;
  try {
    const r = await model.generateContent(prompt);
    console.log(r.response.text().slice(0, 3000));
  } catch (err) {
    console.error(`Gemini error: ${err instanceof Error ? err.message : String(err)}`);
  }
} else if (gate.ok) {
  console.log('\n(GEMINI_API_KEY not set — skipped the Gemini structuring check)');
}

// tesseract keeps a worker thread alive; exit explicitly
process.exit(gate.ok || imagePath.includes('hard') ? 0 : 1);
