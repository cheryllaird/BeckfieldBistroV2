import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { decryptSecret, type EncryptedValue } from './_utils/crypto.js';
import { getOcrEngine, preprocessForOcr, assessOcrQuality, type OcrResult } from './_utils/ocr.js';
import { parseRecipeText } from './_utils/recipeParsers.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type SupportedMediaType = typeof SUPPORTED_MEDIA_TYPES[number];

function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

const SYSTEM_PROMPT =
  'You are a recipe extraction assistant. When given a recipe — either as an image (from a cookbook, handwritten card, screenshot, or printed page) or as text scraped from a webpage — extract the recipe details and return ONLY a valid JSON object — no markdown, no explanation, no code fences.';

const RECIPE_JSON_SCHEMA = `{
  "title": "string — the recipe name",
  "source": "string — cookbook name, website, or 'Photo Upload' if unknown",
  "servings": number,
  "prepTime": "string — e.g. '15 mins', or '' if not shown",
  "totalTime": "string — e.g. '45 mins', or '' if not shown",
  "ingredientSections": [
    {
      "title": "string — section heading, e.g. 'For the dressing' or '' if there is only one unlabeled group",
      "ingredients": [
        {
          "name": "string — ingredient name only, no quantity or unit",
          "quantity": number,
          "unit": "string — e.g. 'cup', 'g', 'tbsp', or '' if none",
          "originalText": "string — the ingredient line exactly as written, e.g. '2 cups flour'"
        }
      ]
    }
  ],
  "steps": ["string — one entry per numbered step or paragraph in the source method"]
}`;

const USER_PROMPT = `Extract the recipe and return a JSON object with exactly these fields:

${RECIPE_JSON_SCHEMA}

Rules:
- Return ONLY the JSON object. No markdown. No explanation.
- Do not pad or elaborate; keep each step faithful to the source wording.
- If all ingredients belong to one unlabeled group, use a single section with title "".
- If ingredients are split into named groups (e.g. main dish + dressing + sauce), create one section per group with a descriptive title.
- If a field cannot be determined, use sensible defaults: empty string for strings, 4 for servings, empty arrays for arrays.
- Keep "originalText" as faithful to the source as possible.
- Match the "steps" array to the recipe's own method structure: create exactly one array entry per numbered step or paragraph in the source. Do NOT break a step into smaller pieces than the recipe does, and do NOT merge separate steps together.
- If the recipe numbers its steps (1, 2, 3…), produce one entry per number, preserving that grouping — even when a single numbered step spans several sentences.`;

// OCR-first path: the photo is transcribed deterministically by tesseract and
// only the TEXT reaches Gemini. Restructuring text it was handed is far less
// likely to trip the RECITATION filter than transcribing a copyrighted page,
// and the verbatim rules below keep the output accurate to the scanned source.
const OCR_SYSTEM_PROMPT =
  'You are a recipe extraction assistant. You are given raw OCR text scanned from a photo of a recipe (cookbook page, recipe card, or printout). Structure it and return ONLY a valid JSON object — no markdown, no explanation, no code fences.';

function ocrUserPrompt(ocrText: string): string {
  return `The following is raw OCR text scanned from a photo of a recipe. Structure it into a JSON object with exactly these fields:

${RECIPE_JSON_SCHEMA}

Rules:
- Return ONLY the JSON object. No markdown. No explanation.
- The text comes from OCR and may contain artifacts: words broken by hyphenation at line ends, 1/l/I and 0/O confusions, stray punctuation. Fix ONLY obvious character-level OCR errors.
- Copy each ingredient's "originalText" verbatim from the OCR text (character-level fixes only). Never rewrite, reorder, or normalize it.
- Each entry in "steps" must preserve the source wording from the OCR text exactly. Do not paraphrase, summarise, or embellish.
- Ignore page numbers, running headers and footers, and photo captions that are not part of the recipe.
- If all ingredients belong to one unlabeled group, use a single section with title "".
- If ingredients are split into named groups (e.g. main dish + dressing + sauce), create one section per group with a descriptive title.
- If a field cannot be determined, use sensible defaults: empty string for strings, 4 for servings, empty arrays for arrays.
- Match the "steps" array to the recipe's own method structure: create exactly one array entry per numbered step or paragraph in the source. Do NOT break a step into smaller pieces than the recipe does, and do NOT merge separate steps together.
- If the recipe numbers its steps (1, 2, 3…), produce one entry per number, preserving that grouping — even when a single numbered step spans several sentences.

OCR text:
${ocrText.slice(0, 20_000)}`;
}

function resolveUrl(imageUrl: string, pageUrl: string): string {
  try {
    return new URL(imageUrl, pageUrl).href;
  } catch {
    return imageUrl;
  }
}

function extractPageImage(html: string, pageUrl: string): string {
  // JSON-LD first (most reliable for recipe sites)
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]) as Record<string, unknown>;
      const items: unknown[] = Array.isArray(data['@graph']) ? (data['@graph'] as unknown[]) : [data];
      for (const item of items) {
        const rec = item as Record<string, unknown>;
        if (rec['@type'] === 'Recipe') {
          const img = rec.image;
          let imgUrl = '';
          if (typeof img === 'string') imgUrl = img;
          else if (Array.isArray(img)) imgUrl = String(img[0] ?? '');
          else if (img && typeof img === 'object') imgUrl = String((img as Record<string, unknown>).url ?? '');
          if (imgUrl) return resolveUrl(imgUrl, pageUrl);
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }

  // og:image fallback
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og?.[1]) return resolveUrl(og[1], pageUrl);

  // twitter:image fallback
  const tw =
    html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
  if (tw?.[1]) return resolveUrl(tw[1], pageUrl);

  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 8000);
}

function isRateLimitError(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  const status = (e.status ?? e.httpStatus ?? e.statusCode) as number | undefined;
  const message = err instanceof Error ? err.message : String(err);
  return (
    status === 429 ||
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.toLowerCase().includes('too many requests') ||
    message.toLowerCase().includes('quota exceeded')
  );
}

// 503 UNAVAILABLE — the model is temporarily overloaded ("high demand"). Unlike
// a rate limit this is transient and not tied to our quota, so it's worth
// retrying the same model after a short backoff before giving up.
function isOverloadError(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  const status = (e.status ?? e.httpStatus ?? e.statusCode) as number | undefined;
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    status === 503 ||
    message.includes('503') ||
    message.includes('unavailable') ||
    message.includes('overloaded') ||
    message.includes('high demand') ||
    message.includes('try again later')
  );
}

// RECITATION — Gemini blocks a candidate when its OUTPUT reproduces copyrighted
// material (published cookbooks, recipe sites) too closely. It is the generated
// text that is flagged, not the prompt, and it is not tied to quota — retrying
// the same prompt at the same settings won't help. Because the block is on the
// decoded tokens, the recovery re-runs at a higher temperature (see
// callGeminiWithRetry), which is Google's recommended mitigation; a persistent
// block yields a clear 422 rather than a silently altered recipe.
function isRecitationError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes('recitation');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Higher temperature loosens greedy decoding so the output is less likely to
// land on a copyrighted recipe's exact wording — Google's recommended RECITATION
// mitigation. It is applied only on the retry after a block, so normal
// extractions keep the model's default (more faithful) decoding. Kept moderate
// so the extraction stays grounded in the image (quantities/ingredients don't
// drift) while still breaking the verbatim token match.
const RECITATION_RETRY_TEMP = 1.3;

function generateWithModel(
  genAI: GoogleGenerativeAI,
  modelName: string,
  parts: (string | Part)[],
  systemInstruction: string,
  temperature?: number,
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    ...(temperature !== undefined && { generationConfig: { temperature } }),
  });
  return model.generateContent(parts).then((r) => r.response.text());
}

async function callGeminiWithRetry(
  genAI: GoogleGenerativeAI,
  parts: (string | Part)[],
  systemInstruction: string = SYSTEM_PROMPT,
): Promise<string> {
  const PRIMARY = 'gemini-3.1-flash-lite';
  const FALLBACK = 'gemini-3.5-flash';
  // Backoff schedule for transient 503 overloads on the primary model. A
  // rate-limit (429) does NOT retry the same model — retrying wastes the daily
  // RPD allowance — it drops straight to the fallback's separate quota bucket.
  const backoffsMs = [0, 1000, 2500];
  let primaryErr: unknown;

  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    if (backoffsMs[attempt] > 0) await sleep(backoffsMs[attempt]);
    console.log(`${PRIMARY} attempt ${attempt + 1}/${backoffsMs.length}`);
    try {
      return await generateWithModel(genAI, PRIMARY, parts, systemInstruction);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${PRIMARY} failed: ${message}`);
      primaryErr = err;
      if (isOverloadError(err)) {
        if (attempt < backoffsMs.length - 1) continue; // transient — retry primary
        break; // out of retries — try the fallback model
      }
      if (isRateLimitError(err)) break; // quota — go straight to fallback
      if (isRecitationError(err)) break; // copyright block — go to temperature retry
      throw err; // anything else is non-retryable
    }
  }

  // Quota/overload fallback at default decoding — skipped when the primary was
  // blocked by RECITATION, since a second model at the same settings tends to
  // block the same content; that case drops straight to the temperature retry.
  if (!isRecitationError(primaryErr)) {
    console.log(`${PRIMARY} unavailable, falling back to ${FALLBACK}`);
    try {
      return await generateWithModel(genAI, FALLBACK, parts, systemInstruction);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${FALLBACK} failed: ${message}`);
      if (!isRecitationError(err)) throw primaryErr; // quota/overload/other — surface primary cause
      primaryErr = err; // fallback recited too — fall through to the temperature retry
    }
  }

  // RECITATION recovery — the block is on the OUTPUT, so retry both models at a
  // higher temperature (Google's recommended fix). The extraction stays grounded
  // in the photo; only token-level phrasing loosens enough to clear the filter.
  console.log('RECITATION block — retrying with higher temperature');
  for (const model of [PRIMARY, FALLBACK]) {
    try {
      return await generateWithModel(genAI, model, parts, systemInstruction, RECITATION_RETRY_TEMP);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${model} high-temperature retry failed: ${message}`);
      if (!isRecitationError(err)) throw err; // a different failure — surface it
      primaryErr = err;
    }
  }
  throw primaryErr; // still RECITATION on both models — handler maps to a clear 422
}

function parseRecipeJson(rawText: string): Record<string, unknown> | null {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function coerceIngredientSections(data: Record<string, unknown>) {
  const parseIngredient = (ing: Record<string, unknown>) => ({
    name: String(ing.name ?? ''),
    quantity: Number(ing.quantity) || 0,
    unit: String(ing.unit ?? ''),
    originalText: String(ing.originalText ?? ''),
  });

  return Array.isArray(data.ingredientSections)
    ? (data.ingredientSections as Record<string, unknown>[]).map((sec) => ({
        title: String(sec.title ?? ''),
        ingredients: Array.isArray(sec.ingredients)
          ? (sec.ingredients as Record<string, unknown>[]).map(parseIngredient)
          : [],
      }))
    : Array.isArray(data.ingredients)
      ? [{ title: '', ingredients: (data.ingredients as Record<string, unknown>[]).map(parseIngredient) }]
      : [{ title: '', ingredients: [] }];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Firebase ID token
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  let uid: string;
  try {
    initFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Validate request body
  const { base64, mediaType, url } = req.body ?? {};
  const hasImage = typeof base64 === 'string' && base64.length > 0;
  const hasUrl = typeof url === 'string' && url.length > 0;

  if (!hasImage && !hasUrl) {
    return res.status(400).json({ error: 'Provide either base64 image data or a url' });
  }

  // Each user supplies their own Gemini API key so usage is billed to them,
  // not a single shared key — there is no server-wide fallback. The key is
  // looked up and decrypted here rather than accepted from the client, so it
  // never has to cross the wire on every extraction request.
  const profileSnap = await getFirestore()
    .collection('users').doc(uid).collection('meta').doc('profile').get();
  const encrypted = profileSnap.data()?.geminiApiKeyEncrypted as EncryptedValue | undefined;
  if (!encrypted) {
    return res.status(400).json({ error: 'Add your Gemini API key in Settings to extract recipes.' });
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(encrypted);
  } catch (err) {
    console.error('Failed to decrypt Gemini API key:', err);
    return res.status(500).json({ error: 'Could not read your API key. Please re-enter it in Settings.' });
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Build content parts based on input type
  let parts: (string | Part)[];
  let coverImage = '';

  if (hasImage) {
    const resolvedMediaType: SupportedMediaType = SUPPORTED_MEDIA_TYPES.includes(mediaType)
      ? mediaType
      : 'image/jpeg';
    console.log(`extract-recipe: base64Length=${base64.length} mediaType=${resolvedMediaType}`);

    // OCR-first: deterministic transcription can't trip RECITATION and is
    // verbatim-accurate to the photo. forceVision skips it (debug/rollback lever).
    let ocr: OcrResult | null = null;
    if (req.body.forceVision !== true) {
      try {
        ocr = await getOcrEngine().recognize(await preprocessForOcr(Buffer.from(base64, 'base64')));
      } catch (err) {
        console.error('OCR failed:', err instanceof Error ? err.message : String(err));
      }
    }
    const gate = ocr
      ? assessOcrQuality(ocr)
      : { ok: false, reason: req.body.forceVision === true ? 'force-vision' : 'ocr-crashed' };

    if (gate.ok && ocr) {
      const ocrText = ocr.text.trim();
      console.log(`extract-recipe: ocr confidence=${Math.round(ocr.confidence)} chars=${ocrText.length}`);

      let structured: Record<string, unknown> | null = null;
      try {
        const raw = await callGeminiWithRetry(genAI, [ocrUserPrompt(ocrText)], OCR_SYSTEM_PROMPT);
        structured = parseRecipeJson(raw);
        if (!structured) console.error('OCR structuring: JSON parse failure. Raw:', raw.slice(0, 500));
      } catch (err) {
        console.error('OCR structuring failed:', err instanceof Error ? err.message : String(err));
      }

      if (structured) {
        const ingredientSections = coerceIngredientSections(structured);
        return res.status(200).json({
          title: String(structured.title ?? 'Extracted Recipe'),
          source: String(structured.source ?? 'Photo Upload'),
          servings: Number(structured.servings) || 4,
          prepTime: String(structured.prepTime ?? ''),
          totalTime: String(structured.totalTime ?? ''),
          ingredientSections,
          ingredients: ingredientSections.flatMap((s) => s.ingredients),
          steps: Array.isArray(structured.steps) ? structured.steps.map(String) : [],
          extractionMethod: 'ocr+gemini',
          ocrText: ocrText.slice(0, 15_000),
        });
      }

      // Gemini unavailable or blocked (incl. RECITATION on the text pass) —
      // structure the verbatim OCR text locally so the user still gets a result.
      const local = parseRecipeText(ocrText);
      return res.status(200).json({
        title: local.title,
        source: 'Photo Upload',
        servings: local.servings,
        prepTime: local.prepTime,
        totalTime: local.totalTime,
        ingredientSections: local.ingredientSections,
        ingredients: local.ingredientSections.flatMap((s) => s.ingredients),
        steps: local.steps,
        extractionMethod: 'ocr+local',
        ocrText: ocrText.slice(0, 15_000),
      });
    }

    // OCR couldn't read the photo (handwriting, stylized fonts, blur) — legacy
    // Gemini vision is the last resort, so RECITATION is only reachable for
    // photos OCR had no text for anyway.
    console.log(`extract-recipe: ocr gate fail: ${gate.reason} — using gemini-vision`);
    parts = [
      { inlineData: { mimeType: resolvedMediaType, data: base64 } },
      USER_PROMPT,
    ];
  } else {
    // URL path — fetch page and strip to plain text
    let pageText: string;
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BistroBot/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const contentType = resp.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        return res.status(400).json({ error: 'URL does not point to an HTML page' });
      }
      const html = await resp.text();
      coverImage = extractPageImage(html, url);
      pageText = stripHtml(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`URL fetch error: ${msg}`);
      return res.status(400).json({
        error: 'Could not fetch the recipe page. Check the URL and try again.',
      });
    }

    const hostname = new URL(url).hostname.replace('www.', '');
    console.log(`extract-recipe: url=${hostname} textLength=${pageText.length}`);
    parts = [`The following is text extracted from ${hostname}.\n\n${pageText}\n\n${USER_PROMPT}`];
  }

  let rawText: string;
  try {
    rawText = await callGeminiWithRetry(genAI, parts);
  } catch (err) {
    if (isRateLimitError(err)) {
      return res.status(429).json({
        error: 'Your Gemini API key has hit its rate limit or daily quota. Wait a bit and try again, or upgrade your key at aistudio.google.com.',
      });
    }
    if (isOverloadError(err)) {
      return res.status(503).json({
        error: 'Gemini is experiencing high demand right now. Please try again in a moment.',
      });
    }
    if (isRecitationError(err)) {
      return res.status(422).json({
        error: "This recipe matches a copyrighted source too closely for the AI to copy. Try a clearer photo of just the ingredients and steps, or enter it manually.",
      });
    }
    return res.status(502).json({ error: 'AI service error. Please try again.' });
  }

  // Parse response
  const data = parseRecipeJson(rawText);
  if (!data) {
    console.error('JSON parse failure. Raw response:', rawText);
    return res.status(422).json({
      error: 'Could not read the recipe. Please try again or enter it manually.',
    });
  }

  const ingredientSections = coerceIngredientSections(data);
  const ingredients = ingredientSections.flatMap((s) => s.ingredients);

  return res.status(200).json({
    title: String(data.title ?? 'Extracted Recipe'),
    source: String(data.source ?? (hasUrl ? new URL(url).hostname.replace('www.', '') : 'Photo Upload')),
    servings: Number(data.servings) || 4,
    prepTime: String(data.prepTime ?? ''),
    totalTime: String(data.totalTime ?? ''),
    ingredientSections,
    ingredients,
    steps: Array.isArray(data.steps) ? data.steps.map(String) : [],
    ...(coverImage && { coverImage }),
    ...(hasImage && { extractionMethod: 'gemini-vision' }),
  });
}
