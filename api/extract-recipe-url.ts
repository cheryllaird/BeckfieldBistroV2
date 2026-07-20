import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { decryptSecret, type EncryptedValue } from './_utils/crypto.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

function extractOgImage(html: string): string {
  // og:image — handles both attribute orderings
  const m1 =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (m1?.[1]) return m1[1];

  // twitter:image fallback
  const m2 =
    html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
  if (m2?.[1]) return m2[1];

  return '';
}

function resolveImageUrl(imageUrl: string, pageUrl: string): string {
  if (!imageUrl) return '';
  try {
    return new URL(imageUrl, pageUrl).href;
  } catch {
    return imageUrl;
  }
}

interface JsonLdRecipe {
  '@type': string | string[];
  name?: string;
  recipeIngredient?: string[];
  recipeInstructions?: unknown[];
  recipeYield?: string | number;
  prepTime?: string;
  totalTime?: string;
  image?: string | string[] | { url?: string };
}

function extractJsonLd(html: string): JsonLdRecipe | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]) as unknown;
      const candidates: unknown[] = Array.isArray(data)
        ? data
        : (data as Record<string, unknown>)['@graph']
          ? ((data as Record<string, unknown>)['@graph'] as unknown[])
          : [data];

      for (const item of candidates) {
        const obj = item as Record<string, unknown>;
        const type = obj['@type'];
        const isRecipe =
          type === 'Recipe' ||
          (Array.isArray(type) && (type as string[]).includes('Recipe'));
        if (isRecipe) return obj as unknown as JsonLdRecipe;
      }
    } catch {
      // malformed JSON — skip
    }
  }
  return null;
}

function parseIsoDuration(iso: string | undefined): string {
  if (!iso) return '';
  const h = iso.match(/(\d+)H/i);
  const m = iso.match(/(\d+)M/i);
  const hours = h ? parseInt(h[1], 10) : 0;
  const mins = m ? parseInt(m[1], 10) : 0;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  if (mins) return `${mins} mins`;
  return '';
}

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  originalText: string;
}

function parseIngredientLine(line: string): Ingredient {
  const trimmed = line.trim();

  const qtyRe = /^([\d]+(?:[.,]\d+)?(?:\s*[/⁄]\s*[\d]+)?(?:\s*[¼½¾⅓⅔⅛])?)/;
  const qtyMatch = trimmed.match(qtyRe);
  const quantityStr = qtyMatch?.[1]?.trim() ?? '';
  const remainder = trimmed.slice(quantityStr.length).trim();

  const unitWords = [
    'cup','cups','tbsp','tablespoon','tablespoons','tsp','teaspoon','teaspoons',
    'oz','ounce','ounces','lb','pound','pounds','g','gram','grams','kg','kilogram',
    'ml','milliliter','millilitre','l','liter','litre','liters','litres',
    'clove','cloves','slice','slices','piece','pieces','bunch','handful',
    'pinch','dash','can','cans','package','packages','pkg','sprig','sprigs',
    'stalk','stalks','head','heads',
  ];
  const unitRe = new RegExp(`^(${unitWords.join('|')})\\b`, 'i');
  const unitMatch = remainder.match(unitRe);
  const unit = unitMatch?.[1]?.toLowerCase() ?? '';
  const name = remainder.slice(unit.length).replace(/^[\s,of]+/, '').trim();

  let quantity = 0;
  if (quantityStr) {
    const normalized = quantityStr
      .replace('¼', '0.25').replace('½', '0.5').replace('¾', '0.75')
      .replace('⅓', '0.333').replace('⅔', '0.667').replace('⅛', '0.125');
    if (normalized.includes('/')) {
      const parts = normalized.split('/');
      const num = parseFloat(parts[0].trim());
      const den = parseFloat(parts[1].trim());
      quantity = den ? num / den : 0;
    } else {
      quantity = parseFloat(normalized.replace(',', '.')) || 0;
    }
  }

  return { name: name || trimmed, quantity, unit, originalText: trimmed };
}

function flattenInstructions(instructions: unknown[]): string[] {
  const steps: string[] = [];
  for (const item of instructions) {
    if (typeof item === 'string') {
      steps.push(item.trim());
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (obj['@type'] === 'HowToSection' && Array.isArray(obj.itemListElement)) {
        steps.push(...flattenInstructions(obj.itemListElement as unknown[]));
      } else if (obj.text) {
        steps.push(String(obj.text).trim());
      } else if (obj.name) {
        steps.push(String(obj.name).trim());
      }
    }
  }
  return steps.filter(Boolean);
}

interface IngredientSection {
  title: string;
  ingredients: Ingredient[];
}

interface RecipeResponse {
  title: string;
  source: string;
  servings: number;
  prepTime: string;
  totalTime: string;
  ingredientSections: IngredientSection[];
  ingredients: Ingredient[];
  steps: string[];
  coverImage: string;
}

function looksLikeSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  // If it starts with a digit or fraction character it's an ingredient amount
  if (/^[\d¼½¾⅓⅔⅛]/.test(trimmed)) return false;
  // Explicit colon at end is a strong signal
  if (trimmed.endsWith(':')) return true;
  // Common section-heading prefixes
  if (/^(for |to make |sauce|dressing|marinade|topping|garnish|glaze|filling|crust|batter|coating)/i.test(trimmed)) return true;
  // If the ingredient parser finds nothing useful, treat as header
  const parsed = parseIngredientLine(trimmed);
  if (parsed.quantity === 0 && parsed.unit === '' && parsed.name === trimmed) return true;
  return false;
}

function buildIngredientSections(lines: string[]): IngredientSection[] {
  const sections: IngredientSection[] = [];
  let current: IngredientSection = { title: '', ingredients: [] };

  for (const line of lines) {
    if (looksLikeSectionHeader(line)) {
      if (current.ingredients.length > 0) sections.push(current);
      current = { title: line.trim().replace(/:$/, ''), ingredients: [] };
    } else {
      current.ingredients.push(parseIngredientLine(line));
    }
  }
  if (current.ingredients.length > 0 || sections.length === 0) sections.push(current);
  return sections;
}

function parseJsonLdRecipe(ld: JsonLdRecipe, source: string, coverImage: string): RecipeResponse {
  const yieldRaw = String(ld.recipeYield ?? '4');
  const yieldMatch = yieldRaw.match(/\d+/);
  const servings = yieldMatch ? parseInt(yieldMatch[0], 10) : 4;

  const ingredientSections = buildIngredientSections(ld.recipeIngredient ?? []);
  const ingredients = ingredientSections.flatMap((s) => s.ingredients);
  const steps = flattenInstructions(ld.recipeInstructions ?? []);

  let ldImage = '';
  if (typeof ld.image === 'string') ldImage = ld.image;
  else if (Array.isArray(ld.image)) ldImage = String(ld.image[0] ?? '');
  else if (ld.image && typeof ld.image === 'object') ldImage = String((ld.image as { url?: string }).url ?? '');

  return {
    title: String(ld.name ?? 'Recipe'),
    source,
    servings,
    prepTime: parseIsoDuration(ld.prepTime),
    totalTime: parseIsoDuration(ld.totalTime),
    ingredientSections,
    ingredients,
    steps,
    coverImage: ldImage || coverImage,
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|section|article|header|footer|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Gemini prompts ───────────────────────────────────────────────────────────

const URL_SYSTEM_PROMPT =
  'You are a recipe extraction assistant. When given the plain-text content of a recipe webpage, extract the recipe details and return ONLY a valid JSON object — no markdown, no explanation, no code fences.';

function urlUserPrompt(source: string): string {
  return `Extract the recipe from this webpage text and return a JSON object with exactly these fields:

{
  "title": "string — the recipe name",
  "source": "${source}",
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
          "originalText": "string — the ingredient line exactly as it appears on the page"
        }
      ]
    }
  ],
  "steps": ["string — each step as a separate string"]
}

Rules:
- Return ONLY the JSON object. No markdown. No explanation.
- The source field must be exactly "${source}".
- If all ingredients belong to one unlabeled group, use a single section with title "".
- If ingredients are split into named groups (e.g. main dish + dressing + sauce), create one section per group with a descriptive title.
- If a field cannot be determined, use sensible defaults: empty string for strings, 4 for servings, empty arrays.
- Ingredients must separate name from quantity and unit.
- Keep "originalText" faithful to the source text.
- Split steps so each array entry is one complete instruction.
- Ignore navigation, ads, comments, related recipes, and other non-recipe content.

Webpage text:
`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

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

  // Validate URL
  const { url } = req.body ?? {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Missing url' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: 'URL must use http or https' });
  }

  const source = parsedUrl.hostname.replace(/^www\./, '');

  // Fetch HTML
  let html: string;
  try {
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Bistro-RecipeBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(8_000),
      redirect: 'follow',
    });

    if (!fetchRes.ok) {
      return res.status(422).json({
        error: `Could not fetch that page (HTTP ${fetchRes.status}). Check the URL and try again.`,
      });
    }

    const contentType = fetchRes.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return res.status(422).json({ error: 'URL does not point to an HTML page.' });
    }

    html = await fetchRes.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('HTML fetch error:', message);
    return res.status(422).json({
      error: 'Could not reach that URL. Check the address and try again.',
    });
  }

  // Extract cover image
  const rawCoverImage = extractOgImage(html);
  const coverImage = resolveImageUrl(rawCoverImage, url);

  // Try JSON-LD fast path
  const ldRecipe = extractJsonLd(html);
  if (ldRecipe) {
    const result = parseJsonLdRecipe(ldRecipe, source, coverImage);
    // Resolve JSON-LD image URL too
    result.coverImage = resolveImageUrl(result.coverImage, url);
    console.log(`extract-recipe-url: JSON-LD path source=${source} steps=${result.steps.length} ingredients=${result.ingredients.length}`);
    return res.status(200).json(result);
  }

  // Gemini text fallback — each user supplies their own API key so usage is
  // billed to them, not a single shared key. There is no server-wide fallback,
  // and the key is looked up/decrypted here rather than sent by the client.
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

  const pageText = htmlToText(html).slice(0, 40_000);

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = urlUserPrompt(source) + pageText;

  const isRateLimitMsg = (msg: string) =>
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('too many requests') ||
    msg.toLowerCase().includes('quota exceeded');
  // 503 UNAVAILABLE — model temporarily overloaded ("high demand"). Transient
  // and not tied to our quota, so it's worth retrying the same model briefly.
  const isOverloadMsg = (msg: string) => {
    const m = msg.toLowerCase();
    return (
      m.includes('503') ||
      m.includes('unavailable') ||
      m.includes('overloaded') ||
      m.includes('high demand') ||
      m.includes('try again later')
    );
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let rawText: string | undefined;
  let primaryMsg = '';
  const backoffsMs = [0, 1000, 2500];
  for (let attempt = 0; attempt < backoffsMs.length; attempt++) {
    if (backoffsMs[attempt] > 0) await sleep(backoffsMs[attempt]);
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest', systemInstruction: URL_SYSTEM_PROMPT });
      rawText = await model.generateContent(prompt).then((r) => r.response.text());
      break;
    } catch (primaryErr) {
      primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      console.error(`gemini-flash-lite-latest failed on URL extraction: ${primaryMsg}`);
      if (isOverloadMsg(primaryMsg) && attempt < backoffsMs.length - 1) continue; // transient — retry
      if (isOverloadMsg(primaryMsg) || isRateLimitMsg(primaryMsg)) break; // fall back to lite
      return res.status(502).json({ error: 'AI service error. Please try again.' }); // non-retryable
    }
  }

  if (rawText === undefined) {
    // Primary exhausted (quota or persistent overload) — try the fuller Flash model
    // (separate quota bucket; more capable, though more prone to its own overloads).
    console.log('gemini-flash-lite-latest unavailable on URL extraction, falling back to gemini-flash-latest');
    try {
      const fallback = genAI.getGenerativeModel({ model: 'gemini-flash-latest', systemInstruction: URL_SYSTEM_PROMPT });
      rawText = await fallback.generateContent(prompt).then((r) => r.response.text());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Gemini fallback error:', message);
      if (isOverloadMsg(primaryMsg) || isOverloadMsg(message)) {
        return res.status(503).json({
          error: 'Gemini is experiencing high demand right now. Please try again in a moment.',
        });
      }
      return res.status(429).json({
        error: 'Your Gemini API key has hit its rate limit or daily quota. Wait a bit and try again, or upgrade your key at aistudio.google.com.',
      });
    }
  }

  if (rawText === undefined) {
    return res.status(502).json({ error: 'AI service error. Please try again.' });
  }

  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Not an object');
    }
    data = parsed as Record<string, unknown>;
  } catch {
    console.error('JSON parse failure. Raw:', rawText.slice(0, 500));
    return res.status(422).json({
      error: 'Could not extract the recipe from that page. Try a different URL or enter it manually.',
    });
  }

  console.log(`extract-recipe-url: Gemini path source=${source}`);

  const parseIngredient = (ing: Record<string, unknown>) => ({
    name: String(ing.name ?? ''),
    quantity: Number(ing.quantity) || 0,
    unit: String(ing.unit ?? ''),
    originalText: String(ing.originalText ?? ''),
  });

  const ingredientSections: IngredientSection[] = Array.isArray(data.ingredientSections)
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
    title: String(data.title ?? 'Recipe'),
    source: String(data.source ?? source),
    servings: Number(data.servings) || 4,
    prepTime: String(data.prepTime ?? ''),
    totalTime: String(data.totalTime ?? ''),
    ingredientSections,
    ingredients,
    steps: Array.isArray(data.steps) ? (data.steps as unknown[]).map(String) : [],
    coverImage,
  });
}
