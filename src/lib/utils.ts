import type { Ingredient, IngredientSection, Recipe } from '../types';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Returns a flat ingredient list from a recipe, preferring ingredientSections when present. */
export function getRecipeIngredients(recipe: Pick<Recipe, 'ingredients' | 'ingredientSections'>): Ingredient[] {
  if (recipe.ingredientSections?.length) {
    return recipe.ingredientSections.flatMap((s: IngredientSection) => s.ingredients);
  }
  return recipe.ingredients;
}

export function scaleIngredient(ingredient: Ingredient, originalServings: number, newServings: number): Ingredient {
  const ratio = newServings / originalServings;
  return { ...ingredient, quantity: Math.round(ingredient.quantity * ratio * 100) / 100 };
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekDays(weekOffset: number = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  // Get this Monday
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
  monday.setDate(today.getDate() - dayOfWeek + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function formatDayLabel(date: Date): { weekday: string; monthDay: string; isToday: boolean } {
  const today = new Date();
  const isToday = isoDate(date) === isoDate(today);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    monthDay: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    isToday,
  };
}

/**
 * What to show as a recipe's source. Recipes saved without one fall back to
 * "Unknown", which reads poorly when there's a link to name it by instead —
 * so prefer the link's host in that case.
 */
export function recipeSourceLabel(recipe: Pick<Recipe, 'source' | 'sourceUrl'>): string {
  const source = recipe.source?.trim();
  if (source && source.toLowerCase() !== 'unknown') return source;
  if (recipe.sourceUrl) {
    try {
      return new URL(recipe.sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      // fall through to the plain source
    }
  }
  return source || 'Unknown';
}
