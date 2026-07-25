import { auth } from './firebase';
import type { Recipe } from '../types';

export class RecipeExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeExtractionError';
  }
}

// Default max dimension — keeps cover images small enough to store as data
// URLs inside Firestore docs (1 MiB cap). The OCR extraction path overrides
// this with a higher resolution since OCR accuracy improves with pixel density.
const MAX_DIMENSION = 1568;

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

  const token = await auth.currentUser.getIdToken();

  // Resize before sending — big enough for server-side OCR accuracy, small
  // enough (≲2.7 MB as base64) to stay under the endpoint's 8mb body limit
  const resized = await resizeImage(dataUrl, { maxDimension: 2048, quality: 0.9 });
  const { base64, mediaType } = parseDataUrl(resized);

  const response = await fetch('/api/extract-recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ base64, mediaType }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new RecipeExtractionError(
      body.error ?? 'Failed to extract recipe. Please try again.'
    );
  }

  return response.json() as Promise<Partial<Recipe>>;
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

  const token = await auth.currentUser.getIdToken();

  const response = await fetch('/api/extract-recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new RecipeExtractionError(
      body.error ?? 'Failed to extract recipe. Please try again.'
    );
  }

  return response.json() as Promise<Partial<Recipe>>;
}
