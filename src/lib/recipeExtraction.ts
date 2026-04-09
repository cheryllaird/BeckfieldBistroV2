import { auth } from './firebase';
import type { Recipe } from '../types';

export class RecipeExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeExtractionError';
  }
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
  const { base64, mediaType } = parseDataUrl(dataUrl);

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
