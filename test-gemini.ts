/**
 * Quick smoke test for the Gemini 2.0 Flash vision integration.
 * Run with:  npx tsx test-gemini.ts
 *
 * Requires GEMINI_API_KEY in .env.local
 * Get a free key at: https://aistudio.google.com/app/apikey
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

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('ERROR: GEMINI_API_KEY is not set. Add it to .env.local');
  console.error('Get a free key at: https://aistudio.google.com/app/apikey');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: 'You are a helpful assistant.',
});

// Minimal 1×1 pixel white PNG — enough to test vision endpoint reachability
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
  'AABjkB6QAAAABJRU5ErkJggg==';

console.log('Testing gemini-2.5-flash vision...\n');

try {
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/png', data: TINY_PNG_BASE64 } },
    'What colour is this image? Answer in one sentence.',
  ]);

  const text = result.response.text();
  console.log('Response :', text);
  console.log('\nConnection to gemini-2.5-flash vision is working correctly.');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Gemini error: ${message}`);
  process.exit(1);
}
