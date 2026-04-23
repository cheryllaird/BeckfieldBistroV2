import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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
  "ingredients": [
    {
      "name": "string — ingredient name only, no quantity or unit",
      "quantity": number,
      "unit": "string — e.g. 'cup', 'g', 'tbsp', or '' if none",
      "originalText": "string — the ingredient line exactly as written, e.g. '2 cups flour'"
    }
  ],
  "steps": ["string — each step as a separate string"]
}

Rules:
- Return ONLY the JSON object. No markdown. No explanation.
- If a field cannot be determined, use sensible defaults: empty string for strings, 4 for servings, empty arrays for arrays.
- Keep "originalText" as faithful to the source as possible.
- Split steps so each array entry is one paragraph of instruction.`;

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
    .slice(0, 15000);
}

async function callGeminiWithRetry(fn: () => Promise<string>): Promise<string> {
  const delays = [8000, 20000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    console.log(`Gemini attempt ${attempt + 1}/${delays.length + 1}`);
    try {
      return await fn();
    } catch (err) {
      const e = err as Record<string, unknown>;
      const status = (e.status ?? e.httpStatus ?? e.statusCode) as number | undefined;
      const message = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.constructor.name : typeof err;
      // Log every property on the error object for Vercel log diagnostics
      const errKeys = Object.getOwnPropertyNames(e).filter((k) => k !== 'stack');
      const errProps: Record<string, unknown> = {};
      for (const k of errKeys) errProps[k] = e[k];
      console.error(`Gemini attempt ${attempt + 1} failed: ${errName} status=${status} keys=${errKeys.join(',')}`);
      console.error(`Gemini error props: ${JSON.stringify(errProps)}`);
      console.error(`Gemini error message: ${message}`);
      const isRateLimit =
        status === 429 ||
        message.includes('429') ||
        message.includes('RESOURCE_EXHAUSTED') ||
        message.toLowerCase().includes('too many requests') ||
        message.toLowerCase().includes('quota exceeded');
      if (!isRateLimit || attempt === delays.length) throw err;
      console.log(`Rate limit detected — waiting ${delays[attempt]}ms before retry`);
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw new Error('unreachable');
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

  try {
    initFirebaseAdmin();
    await getAuth().verifyIdToken(token);
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

  // Call Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is not configured for AI extraction' });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

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
    rawText = await callGeminiWithRetry(() =>
      model.generateContent(parts).then((r) => r.response.text())
    );
  } catch (err) {
    const e = err as Record<string, unknown>;
    const status = (e.status ?? e.httpStatus ?? e.statusCode) as number | undefined;
    const message = err instanceof Error ? err.message : String(err);
    const isRateLimit =
      status === 429 ||
      message.includes('429') ||
      message.includes('RESOURCE_EXHAUSTED') ||
      message.toLowerCase().includes('too many requests') ||
      message.toLowerCase().includes('quota exceeded');
    if (isRateLimit) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
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

  return res.status(200).json({
    title: String(data.title ?? 'Extracted Recipe'),
    source: String(data.source ?? (hasUrl ? new URL(url).hostname.replace('www.', '') : 'Photo Upload')),
    servings: Number(data.servings) || 4,
    prepTime: String(data.prepTime ?? ''),
    totalTime: String(data.totalTime ?? ''),
    ingredients: Array.isArray(data.ingredients)
      ? (data.ingredients as Record<string, unknown>[]).map((ing) => ({
          name: String(ing.name ?? ''),
          quantity: Number(ing.quantity) || 0,
          unit: String(ing.unit ?? ''),
          originalText: String(ing.originalText ?? ''),
        }))
      : [],
    steps: Array.isArray(data.steps) ? data.steps.map(String) : [],
    ...(coverImage && { coverImage }),
  });
}
