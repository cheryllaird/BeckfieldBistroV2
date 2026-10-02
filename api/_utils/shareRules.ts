// Pure validation for api/share-recipe.ts, kept free of Firebase so it can be
// unit-tested. A share is built here from an allow-list of fields rather than
// stored as the client sent it: the recipient's client copies the recipe
// straight into their library, and the sender's name and avatar are shown as
// "From …", so none of it can be taken on trust.

import { EMAIL_RE, normalizeEmail, type Rejection } from './bistroRules.js';
import type { AuthedUser } from './auth.js';

/** Shares one account may send per rolling day. */
export const MAX_SHARES_PER_DAY = 50;

const MAX_IMAGE_CHARS = 1_000_000; // Firestore caps a doc at 1 MiB anyway
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  originalText: string;
}

export interface ShareRecipe {
  title: string;
  source: string;
  sourceUrl?: string;
  coverImage?: string;
  originalImage?: string;
  servings: number;
  prepTime: string;
  totalTime: string;
  ingredients: Ingredient[];
  ingredientSections?: { title: string; ingredients: Ingredient[] }[];
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ShareDoc {
  fromUid: string;
  fromName: string;
  fromAvatar?: string;
  toEmail: string;
  recipe: ShareRecipe;
  createdAt: string;
}

class Invalid extends Error {}

function text(value: unknown, max: number, field: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Invalid(`${field} must be text`);
  if (value.length > max) throw new Invalid(`${field} is too long`);
  return value;
}

function list<T>(value: unknown, max: number, field: string, item: (v: unknown) => T): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Invalid(`${field} must be a list`);
  if (value.length > max) throw new Invalid(`${field} has too many entries`);
  return value.map(item);
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** A link the recipient may open: http(s) only, else dropped. */
export function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000 || !isHttpUrl(value)) return undefined;
  return value;
}

/** An image the recipient's client will render: an http(s) URL or an inline image, else dropped. */
export function safeImage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value.length > MAX_IMAGE_CHARS) return undefined;
  if (value.startsWith('data:')) return IMAGE_DATA_URL.test(value) ? value : undefined;
  return value.length <= 2000 && isHttpUrl(value) ? value : undefined;
}

function ingredient(v: unknown): Ingredient {
  if (!v || typeof v !== 'object') throw new Invalid('Each ingredient must be an object');
  const i = v as Record<string, unknown>;
  const quantity = typeof i.quantity === 'number' && Number.isFinite(i.quantity) ? i.quantity : 0;
  return {
    name: text(i.name, 300, 'Ingredient name'),
    quantity,
    unit: text(i.unit, 50, 'Ingredient unit'),
    originalText: text(i.originalText, 1000, 'Ingredient text'),
  };
}

function recipe(v: unknown): ShareRecipe {
  if (!v || typeof v !== 'object') throw new Invalid('Missing recipe');
  const r = v as Record<string, unknown>;
  const title = text(r.title, 300, 'Title').trim();
  if (!title) throw new Invalid('The recipe needs a title');
  const servings = typeof r.servings === 'number' && Number.isFinite(r.servings)
    ? Math.min(Math.max(r.servings, 0), 1000)
    : 0;
  const out: ShareRecipe = {
    title,
    source: text(r.source, 300, 'Source'),
    servings,
    prepTime: text(r.prepTime, 100, 'Prep time'),
    totalTime: text(r.totalTime, 100, 'Total time'),
    ingredients: list(r.ingredients, 500, 'Ingredients', ingredient),
    steps: list(r.steps, 300, 'Steps', (s) => text(s, 10_000, 'Step')),
    createdAt: text(r.createdAt, 40, 'createdAt'),
    updatedAt: text(r.updatedAt, 40, 'updatedAt'),
  };
  if (r.ingredientSections !== undefined && r.ingredientSections !== null) {
    out.ingredientSections = list(r.ingredientSections, 50, 'Ingredient sections', (s) => {
      if (!s || typeof s !== 'object') throw new Invalid('Each ingredient section must be an object');
      const sec = s as Record<string, unknown>;
      return {
        title: text(sec.title, 300, 'Section title'),
        ingredients: list(sec.ingredients, 500, 'Section ingredients', ingredient),
      };
    });
  }
  const sourceUrl = safeLink(r.sourceUrl);
  const coverImage = safeImage(r.coverImage);
  const originalImage = safeImage(r.originalImage);
  if (sourceUrl) out.sourceUrl = sourceUrl;
  if (coverImage) out.coverImage = coverImage;
  if (originalImage) out.originalImage = originalImage;
  return out;
}

/**
 * Builds the share to store from an untrusted request body. The sender's
 * identity always comes from the verified token, never from the body.
 */
export function buildShare(
  body: unknown,
  sender: AuthedUser,
  now: Date,
): { share: ShareDoc } | { rejection: Rejection } {
  if (!sender.email) {
    return { rejection: { status: 403, error: 'Verify your email address before sharing recipes.' } };
  }
  if (!body || typeof body !== 'object') {
    return { rejection: { status: 400, error: 'Missing share' } };
  }
  const b = body as Record<string, unknown>;
  const toEmail = normalizeEmail(b.toEmail);
  if (!EMAIL_RE.test(toEmail) || toEmail.length > 254) {
    return { rejection: { status: 400, error: 'Please enter a valid email address.' } };
  }
  try {
    const share: ShareDoc = {
      fromUid: sender.uid,
      fromName: sender.name,
      toEmail,
      recipe: recipe(b.recipe),
      createdAt: now.toISOString(),
    };
    if (sender.avatar) share.fromAvatar = sender.avatar;
    return { share };
  } catch (err) {
    if (err instanceof Invalid) return { rejection: { status: 400, error: err.message } };
    throw err;
  }
}

/** Rejects once the sender has used up today's shares. */
export function checkShareQuota(sentAt: string[], now: Date): Rejection | null {
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const recent = sentAt.filter((t) => Date.parse(t) > dayAgo).length;
  return recent >= MAX_SHARES_PER_DAY
    ? { status: 429, error: "You've shared a lot of recipes today. Try again tomorrow." }
    : null;
}
