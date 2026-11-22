import type { MealEntry } from '../types';

/**
 * How many times each recipe has been on the meal plan, derived from the
 * bistro's meal entries (past and future, all members). Custom and dining-out
 * entries are ignored. Entries pointing at a since-deleted recipe are counted
 * under their id like any other; callers only look up ids they have.
 */
export function countPlans(entries: readonly MealEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== 'recipe' || !entry.recipeId) continue;
    counts.set(entry.recipeId, (counts.get(entry.recipeId) ?? 0) + 1);
  }
  return counts;
}
