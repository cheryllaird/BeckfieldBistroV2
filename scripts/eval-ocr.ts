// OCR-only extraction eval: runs free OCR (Tesseract via api/_utils/ocr.ts)
// and parseRecipeText over a corpus of photos with known-good recipes, scores
// the result and writes report.md, report.json and report.html.
// No Gemini, no network, no Firestore.
//
//   npm run eval:ocr -- --corpus fixtures
//   npm run eval:ocr -- --corpus corpus [--out eval-out] [--limit 20]
//       [--target 2400] [--threshold 160] [--no-normalize] [--no-sharpen]
//
// A corpus holds <id>.jpg, <id>.truth.json and manifest.csv; see
// scripts/ocr-eval/corpus.ts and docs/recipe-extraction.md §11.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { assessOcrQuality, getOcrEngine, preprocessForOcr, type OcrResult, type PreprocessOptions } from '../api/_utils/ocr.js';
import { parseRecipeText } from '../api/_utils/recipeParsers.js';
import { editedGroup, parseManifest, type TruthFile } from './ocr-eval/corpus.js';
import { buildReportJson, renderHtml, renderMarkdown, type PhotoResult } from './ocr-eval/report.js';
import { cer, scoreParsed, scoreText } from './ocr-eval/score.js';

const { values } = parseArgs({
  options: {
    corpus: { type: 'string' },
    out: { type: 'string', default: 'eval-out' },
    limit: { type: 'string' },
    target: { type: 'string' },
    threshold: { type: 'string' },
    'no-normalize': { type: 'boolean', default: false },
    'no-sharpen': { type: 'boolean', default: false },
  },
});

if (!values.corpus) {
  console.error('Usage: npm run eval:ocr -- --corpus <dir> [--out eval-out] [--limit n] [--target px] [--threshold 0-255] [--no-normalize] [--no-sharpen]');
  process.exit(1);
}

const toNumber = (v: string | undefined, name: string): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`--${name} must be a positive number`);
    process.exit(1);
  }
  return n;
};

const corpusDir = values.corpus;
const manifestPath = path.join(corpusDir, 'manifest.csv');
if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} not found. Export a corpus with scripts/export-ocr-corpus.mjs first.`);
  process.exit(1);
}

const variant: PreprocessOptions = {
  ...(values.target !== undefined && { targetLongest: toNumber(values.target, 'target') }),
  ...(values.threshold !== undefined && { threshold: toNumber(values.threshold, 'threshold') }),
  ...(values['no-normalize'] && { normalize: false }),
  ...(values['no-sharpen'] && { sharpen: false }),
};

const limit = toNumber(values.limit, 'limit');
const rows = parseManifest(readFileSync(manifestPath, 'utf8')).slice(0, limit);
const engine = getOcrEngine();
const photos: PhotoResult[] = [];

for (const [i, row] of rows.entries()) {
  const imagePath = path.join(corpusDir, `${row.id}.jpg`);
  const truthPath = path.join(corpusDir, `${row.id}.truth.json`);
  if (!existsSync(imagePath) || !existsSync(truthPath)) {
    console.warn(`skip ${row.id}: missing ${existsSync(imagePath) ? 'truth file' : 'image'}`);
    continue;
  }
  const truth = JSON.parse(readFileSync(truthPath, 'utf8')) as TruthFile;
  const image = readFileSync(imagePath);

  let ocr: OcrResult = { text: '', rawText: '', confidence: 0, columnsReflowed: false };
  let error: string | undefined;
  try {
    ocr = await engine.recognize(await preprocessForOcr(image, variant));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const gate = error ? { ok: false, reason: 'ocr-crashed' } : assessOcrQuality(ocr);
  const parsed = parseRecipeText(ocr.text.trim());
  const thumbnail = await sharp(image, { failOn: 'none' })
    .rotate()
    .resize({ width: 480, height: 480, fit: 'inside' })
    .jpeg({ quality: 60 })
    .toBuffer()
    .then((b) => `data:image/jpeg;base64,${b.toString('base64')}`)
    .catch(() => undefined);

  const result: PhotoResult = {
    id: row.id,
    layout: row.layout,
    handChecked: row.handChecked,
    edited: editedGroup(truth),
    gate,
    confidence: ocr.confidence,
    columnsReflowed: ocr.columnsReflowed,
    stages: {
      raw: scoreText(truth, ocr.rawText),
      reflow: scoreText(truth, ocr.text),
      parser: scoreParsed(truth, parsed),
    },
    truth,
    parsed,
    rawText: ocr.rawText,
    text: ocr.text,
    ...(error && { error }),
    thumbnail,
  };
  photos.push(result);
  const p = result.stages.parser;
  const stepCer = cer(p);
  console.log(
    `[${i + 1}/${rows.length}] ${row.id}: gate ${gate.ok ? 'pass' : `fail (${gate.reason})`}, ` +
      `ingredients ${p.ingredientsMatched}/${p.ingredientsTruth}, step CER ${stepCer === null ? '—' : stepCer.toFixed(2)}, edits ${p.edits}`,
  );
}

const report = buildReportJson(photos, {
  generatedAt: new Date().toISOString(),
  corpus: corpusDir,
  variant: { ...variant },
});
mkdirSync(values.out, { recursive: true });
writeFileSync(path.join(values.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(values.out, 'report.md'), renderMarkdown(report));
writeFileSync(path.join(values.out, 'report.html'), renderHtml(report, photos));
console.log(`\nWrote report.md, report.json and report.html to ${values.out}/`);

// The tesseract worker keeps the process alive; exit explicitly
process.exit(0);
