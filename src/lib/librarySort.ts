import type { Recipe } from '../types';

export type LibrarySort = 'newest' | 'most-planned';

/** Recipes matching the search (title, source or any ingredient name, any case). */
export function filterRecipes(recipes: readonly Recipe[], query: string): Recipe[] {
  // A blank query shows everything; otherwise match the text as typed (as before).
  if (!query.trim()) return [...recipes];
  const q = query.toLowerCase();
  return recipes.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      r.source.toLowerCase().includes(q) ||
      r.ingredients.some((i) => i.name.toLowerCase().includes(q)),
  );
}

const newestFirst = (a: Recipe, b: Recipe) => b.createdAt.localeCompare(a.createdAt);

/**
 * Orders recipes for the library. Newest: by createdAt, newest first.
 * Most planned: by plan count, highest first; ties (including never-planned
 * recipes) fall back to newest first. Returns a new array.
 */
export function sortRecipes(
  recipes: readonly Recipe[],
  sort: LibrarySort,
  planCounts: ReadonlyMap<string, number>,
): Recipe[] {
  const list = [...recipes];
  if (sort === 'newest') return list.sort(newestFirst);
  const count = (r: Recipe) => planCounts.get(r.id) ?? 0;
  return list.sort((a, b) => count(b) - count(a) || newestFirst(a, b));
}

export function filterAndSortRecipes(
  recipes: readonly Recipe[],
  query: string,
  sort: LibrarySort,
  planCounts: ReadonlyMap<string, number>,
): Recipe[] {
  return sortRecipes(filterRecipes(recipes, query), sort, planCounts);
}
