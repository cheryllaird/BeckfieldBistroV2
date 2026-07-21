import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { decryptSecret, type EncryptedValue } from './_utils/crypto.js';

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

const USER_PROMPT = `Extract the recipe and return a JSON object with exactly these fields:

{
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
}

Rules:
- Return ONLY the JSON object. No markdown. No explanation.
- Do not pad or elaborate; keep each step faithful to the source wording.
- If all ingredients belong to one unlabeled group, use a single section with title "".
- If ingredients are split into named groups (e.g. main dish + dressing + sauce), create one section per group with a descriptive title.
- If a field cannot be determined, use sensible defaults: empty string for strings, 4 for servings, empty arrays for arrays.
- Keep "originalText" as faithful to the source as possible.
- Match the "steps" array to the recipe's own method structure: create exactly one array entry per numbered step or paragraph in the source. Do NOT break a step into smaller pieces than the recipe does, and do NOT merge separate steps together.
- If the recipe numbers its steps (1, 2, 3…), produce one entry per number, preserving that grouping — even when a single numbered step spans several sentences.`;

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiWithRetry(genAI: GoogleGenerativeAI, parts: (string | Part)[]): Promise<string> {
  const PRIMARY = 'gemini-flash-lite-latest';
  const FALLBACK = 'gemini-flash-latest';
  // Backoff schedule for transient 503 overloads on the primary model. A
  // rate-limit (429) does NOT retry the same model — retrying wastes the daily
  // RPD allowance — it drops straight to the fallback's separate quota bucket.
  const backoffsMs = [0, 1000, 2500];
  let primaryErr: unknown;

  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    if (backoffsMs[attempt] > 0) await sleep(backoffsMs[attempt]);
    console.log(`${PRIMARY} attempt ${attempt + 1}/${backoffsMs.length}`);
    try {
      const model = genAI.getGenerativeModel({ model: PRIMARY, systemInstruction: SYSTEM_PROMPT });
      return await model.generateContent(parts).then((r) => r.response.text());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${PRIMARY} failed: ${message}`);
      primaryErr = err;
      if (isOverloadError(err)) {
        if (attempt < backoffsMs.length - 1) continue; // transient — retry primary
        break; // out of retries — try the fallback model
      }
      if (isRateLimitError(err)) break; // quota — go straight to fallback
      throw err; // anything else is non-retryable
    }
  }

  // Primary exhausted (quota or persistent overload) — try the fuller Flash model
  // (separate quota bucket; more capable, though more prone to its own overloads).
  console.log(`${PRIMARY} unavailable, falling back to ${FALLBACK}`);
  try {
    const fallback = genAI.getGenerativeModel({ model: FALLBACK, systemInstruction: SYSTEM_PROMPT });
    return await fallback.generateContent(parts).then((r) => r.response.text());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${FALLBACK} failed: ${message}`);
    throw primaryErr;
  }
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
    return res.status(502).json({ error: 'AI service error. Please try again.' });
  }

  // Parse response
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('JSON parse failure. Raw response:', rawText);
    return res.status(422).json({
      error: 'Could not read the recipe. Please try again or enter it manually.',
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return res.status(422).json({
      error: 'The AI returned an unexpected response. Please try again or enter the recipe manually.',
    });
  }

  const data = parsed as Record<string, unknown>;

  const parseIngredient = (ing: Record<string, unknown>) => ({
    name: String(ing.name ?? ''),
    quantity: Number(ing.quantity) || 0,
    unit: String(ing.unit ?? ''),
    originalText: String(ing.originalText ?? ''),
  });

  const ingredientSections = Array.isArray(data.ingredientSections)
    ? (data.ingredientSections as Record<string, unknown>[]).map((sec) => ({
        title: String(sec.title ?? ''),
        ingredients: Array.isArray(sec.ingredients)
          ? (sec.ingredients as Record<string, unknown>[]).map(parseIngredient)
          : [],
      }))
    : Array.isArray(data.ingredients)
      ? [{ title: '', ingredients: (data.ingredients as Record<string, unknown>[]).map(parseIngredient) }]
      : [{ title: '', ingredients: [] }];

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
  });
}
