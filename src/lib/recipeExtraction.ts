import type { User } from 'firebase/auth';
import { auth } from './firebase';
import { authedFetch, NetworkError } from './apiClient';
import type { Recipe } from '../types';

export class RecipeExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeExtractionError';
  }
}

export const CONNECTION_LOST_MESSAGE =
  'Connection lost while reading the recipe. Check your signal and try again.';

/**
 * POSTs to /api/extract-recipe and returns the parsed recipe. A request or
 * response body that fails because the connection dropped (authedFetch's
 * NetworkError, or a TypeError while reading the body) says so, instead of
 * falling through to a generic message that blames the API key.
 */
async function postExtraction(user: User, body: Record<string, string>): Promise<Partial<Recipe>> {
  let response: Response;
  try {
    response = await authedFetch(user, '/api/extract-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof NetworkError || e instanceof TypeError) throw new RecipeExtractionError(CONNECTION_LOST_MESSAGE);
    throw e;
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new RecipeExtractionError(
      errBody.error ?? "Couldn't read a recipe. Try again, or add it manually."
    );
  }

  try {
    return (await response.json()) as Partial<Recipe>;
  } catch (e) {
    if (e instanceof TypeError) throw new RecipeExtractionError(CONNECTION_LOST_MESSAGE);
    throw e;
  }
}

// Default max dimension — keeps cover images small enough to store as data
// URLs inside Firestore docs (1 MiB cap). The OCR extraction path overrides
// this with a higher resolution since OCR accuracy improves with pixel density.
const MAX_DIMENSION = 1568;

// Archival copy of the photo the recipe text was read from. Kept alongside the
// cover image, so it is deliberately smaller/leaner than the cover: two data
// URLs have to share one Firestore doc's 1 MiB budget. Still comfortably
// legible for a cookbook page when opened full-screen.
export const ORIGINAL_IMAGE_RESIZE: ResizeOptions = { maxDimension: 1200, quality: 0.72 };

interface ResizeOptions {
  maxDimension?: number;
  quality?: number;
}

/**
 * Resizes an image DataURL using a canvas so the longest side is at most
 * maxDimension pixels (default 1568). Returns a JPEG DataURL (default quality 0.85).
 */
export function resizeImage(
  dataUrl: string,
  { maxDimension = MAX_DIMENSION, quality = 0.85 }: ResizeOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not available'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function parseDataUrl(dataUrl: string): { base64: string; mediaType: string } {
  const [header, base64] = dataUrl.split(',');
  const mediaType = header.replace('data:', '').replace(';base64', '');
  return { base64, mediaType };
}

export async function extractRecipeFromImage(
  dataUrl: string,
  hasApiKey: boolean
): Promise<Partial<Recipe>> {
  if (!auth?.currentUser) {
    throw new RecipeExtractionError('You must be signed in to extract recipes from photos.');
  }
  if (!hasApiKey) {
    throw new RecipeExtractionError('Add your Gemini API key in Settings to extract recipes.');
  }

  // Resize before sending — big enough for server-side OCR accuracy, small
  // enough (≲2.7 MB as base64) to stay under the endpoint's 8mb body limit
  const t0 = performance.now();
  const resized = await resizeImage(dataUrl, { maxDimension: 2048, quality: 0.9 });
  const { base64, mediaType } = parseDataUrl(resized);
  const t1 = performance.now();

  const recipe = await postExtraction(auth.currentUser, { base64, mediaType });
  // Debug timing only: printed to the console, never sent anywhere.
  console.debug(
    `extract timing: resize=${Math.round(t1 - t0)}ms request=${Math.round(performance.now() - t1)}ms`,
  );
  return recipe;
}

export async function extractRecipeFromUrl(
  url: string,
  hasApiKey: boolean
): Promise<Partial<Recipe>> {
  if (!auth?.currentUser) {
    throw new RecipeExtractionError('You must be signed in to extract recipes from URLs.');
  }
  if (!hasApiKey) {
    throw new RecipeExtractionError('Add your Gemini API key in Settings to extract recipes.');
  }

  return postExtraction(auth.currentUser, { url });
}
