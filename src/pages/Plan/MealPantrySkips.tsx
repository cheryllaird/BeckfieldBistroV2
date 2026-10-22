import { useStore } from '../../store';
import { getRecipeIngredients } from '../../lib/utils';
import { mergeIntoShoppingList, splitByPantry, type PantrySkip } from '../../lib/ingredients';
import type { MealEntry } from '../../types';
import { PantrySkipList } from '../ShoppingList/PantrySkipList';

/** The cupboard ingredients left off when this meal was added, each with "Add anyway". */
export function MealPantrySkips({ entry }: { entry: MealEntry }) {
  const { recipes, pantryItems, shoppingItems, categoryOverrides, setShoppingItems } = useStore();
  const recipe = recipes.find((r) => r.id === entry.recipeId);
  if (!recipe) return null;

  const { skipped } = splitByPantry(getRecipeIngredients(recipe), pantryItems);
  if (skipped.length === 0) return null;
  const added = new Set(
    skipped
      .filter(({ ingredient }) =>
        shoppingItems.some((item) =>
          item.mealSources?.some(
            (src) => src.mealEntryId === entry.id && src.ingredientName === ingredient.name,
          ),
        ),
      )
      .map(({ key }) => key),
  );

  const addAnyway = ({ key, ingredient }: PantrySkip) =>
    setShoppingItems(
      mergeIntoShoppingList(shoppingItems, [ingredient], {
        scale: recipe.servings > 0 ? entry.servings / recipe.servings : 1,
        mealEntryId: entry.id,
        recipeTitle: recipe.title,
        pantryItems,
        keepPantryKeys: new Set([key]),
        categoryOverrides,
      }),
    );

  return (
    <div className="px-3 pb-2 bg-white">
      <PantrySkipList skipped={skipped} added={added} onAdd={addAnyway} />
    </div>
  );
}
