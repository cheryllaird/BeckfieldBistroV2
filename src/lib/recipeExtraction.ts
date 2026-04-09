import { auth } from './firebase';
import type { Recipe } from '../types';

export class RecipeExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeExtractionError';
  }
}

// Anthropic's recommended max dimension for vision — keeps images under the 5MB decoded limit.
const MAX_DIMENSION = 1568;

/**
 * Resizes an image DataURL using a canvas so the longest side is at most
 * MAX_DIMENSION pixels. Returns a JPEG DataURL (quality 0.85).
 */
function resizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not available'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
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

export async function extractRecipeFromImage(dataUrl: string): Promise<Partial<Recipe>> {
  if (!auth?.currentUser) {
    throw new RecipeExtractionError('You must be signed in to extract recipes from photos.');
  }

  const token = await auth.currentUser.getIdToken();

  // Resize before sending — prevents BadRequestError for large phone photos
  const resized = await resizeImage(dataUrl);
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
