/**
 * Quick smoke test for the OpenAI gpt-4o-mini vision integration.
 * Run with:  npx tsx test-openai.ts
 *
 * Requires OPENAI_API_KEY in .env.local
 */

import { readFileSync } from 'fs';
import path from 'path';

// Load .env.local manually (no dotenv dependency needed)
try {
  const envPath = path.join(process.cwd(), '.env.local');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  }
} catch {
  // .env.local not found — rely on env vars already set
}

import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('ERROR: OPENAI_API_KEY is not set. Add it to .env.local');
  process.exit(1);
}

const client = new OpenAI({ apiKey });

// Minimal 1×1 pixel white PNG (base64) — enough to test vision endpoint reachability
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
  'AABjkB6QAAAABJRU5ErkJggg==';

console.log('Testing gpt-4o-mini vision via OpenAI API...\n');

try {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 256,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${TINY_PNG_BASE64}` },
          },
          {
            type: 'text',
            text: 'What colour is this image? Answer in one sentence.',
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? '(no content)';
  console.log('Model    :', response.model);
  console.log('Response :', content);
  console.log('\nConnection to gpt-4o-mini vision is working correctly.');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number }).status;
  console.error(`OpenAI error (status=${status}): ${message}`);
  process.exit(1);
}
