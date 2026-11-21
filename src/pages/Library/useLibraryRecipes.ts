import { useMemo, useState } from 'react';
import { useStore } from '../../store';
import { countPlans } from '../../lib/recipePopularity';
import { filterAndSortRecipes, type LibrarySort } from '../../lib/librarySort';

/**
 * The library's visible recipes: filtered by the search query and ordered by the
 * chosen sort. The sort is component state, so it resets to Newest on each visit.
 * Plan counts are derived live from the store's meal entries (offline too).
 */
export function useLibraryRecipes(query: string) {
  const recipes = useStore((s) => s.recipes);
  const mealEntries = useStore((s) => s.mealEntries);
  const [sort, setSort] = useState<LibrarySort>('newest');
  const planCounts = useMemo(() => countPlans(mealEntries), [mealEntries]);
  const filtered = useMemo(
    () => filterAndSortRecipes(recipes, query, sort, planCounts),
    [recipes, query, sort, planCounts],
  );
  return { filtered, sort, setSort };
}
