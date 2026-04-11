import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
  'You are a recipe extraction assistant. When given an image of a recipe (from a cookbook, handwritten card, screenshot, or printed page), extract the recipe details and return ONLY a valid JSON object — no markdown, no explanation, no code fences.';

const USER_PROMPT = `Extract the recipe from this image and return a JSON object with exactly these fields:

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
- Split steps so each array entry is one discrete instruction.`;

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
  const { base64, mediaType } = req.body ?? {};
  if (typeof base64 !== 'string' || !base64) {
    return res.status(400).json({ error: 'Missing base64 image data' });
  }
  const resolvedMediaType: SupportedMediaType = SUPPORTED_MEDIA_TYPES.includes(mediaType)
    ? mediaType
    : 'image/jpeg';
  console.log(`extract-recipe: base64Length=${base64.length} mediaType=${resolvedMediaType}`);

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

  let rawText: string;
  try {
    const result = await model.generateContent([
      { inlineData: { mimeType: resolvedMediaType, data: base64 } },
      USER_PROMPT,
    ]);

    rawText = result.response.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status;
    console.error(`Gemini error status=${status}`);
    console.error(`Gemini error message=${message}`);
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
      error: 'Could not read the recipe from the photo. Please try again or enter it manually.',
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return res.status(422).json({
      error: 'The AI returned an unexpected response. Please try a clearer photo.',
    });
  }

  const data = parsed as Record<string, unknown>;

  return res.status(200).json({
    title: String(data.title ?? 'Recipe from Photo'),
    source: String(data.source ?? 'Photo Upload'),
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
  });
}
