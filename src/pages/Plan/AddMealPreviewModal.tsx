import { X } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { getRecipeIngredients } from '../../lib/utils';
import { mergeIntoShoppingList, normalizeIngredientName, previewMealAdd } from '../../lib/ingredients';
import type { MealEntry, Recipe } from '../../types';
import { ItemPicker } from '../ShoppingList/ItemPicker';
import { useItemTicks, type PickRow } from '../ShoppingList/useItemTicks';

interface Props {
  entry: MealEntry;
  recipe: Recipe;
  onClose: () => void;
}

/** Shows what a planned meal will add to the list, so the user can drop items first. */
export function AddMealPreviewModal({ entry, recipe, onClose }: Props) {
  const { shoppingItems, pantryItems, categoryOverrides, setShoppingItems } = useStore();
  const { kept, isTicked, toggle } = useItemTicks();

  const ingredients = getRecipeIngredients(recipe);
  const mergeOptions = {
    scale: recipe.servings > 0 ? entry.servings / recipe.servings : 1,
    mealEntryId: entry.id,
    recipeTitle: recipe.title,
    categoryOverrides,
  };
  const rows: PickRow[] = previewMealAdd(shoppingItems, ingredients, { ...mergeOptions, pantryItems }).map((row) => ({
    key: row.key,
    label: row.name,
    detail: row.cupboardItem
      ? `Cupboard: ${row.cupboardItem}`
      : row.previousName ? `Adds to ${row.previousName}` : undefined,
    inCupboard: row.cupboardItem !== undefined,
  }));
  const ticked = new Set(rows.filter(isTicked).map((row) => row.key));

  const handleAdd = () => {
    // Merge into the list as it is now, so changes synced in while the sheet
    // was open are kept. Only the ticked rows go on.
    const latest = useStore.getState();
    const notTicked = ingredients.map((i) => normalizeIngredientName(i.name)).filter((key) => !ticked.has(key));
    setShoppingItems(
      mergeIntoShoppingList(latest.shoppingItems, ingredients, {
        ...mergeOptions,
        pantryItems: latest.pantryItems,
        keepPantryKeys: kept,
        excludeKeys: new Set(notTicked),
      }),
    );
    onClose();
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div
          role="dialog"
          aria-label={`Add ${recipe.title} to shopping list`}
          className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col max-h-[90dvh] animate-slide-up"
        >
          <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-100 shrink-0">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-800">Add to shopping list</h3>
              <p className="text-xs text-slate-500 truncate">{recipe.title} · {entry.servings} servings</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-4 py-3">
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Everything's already on the list.</p>
            ) : (
              <ItemPicker rows={rows} isTicked={isTicked} onToggle={toggle} />
            )}
          </div>

          <div className="p-4 border-t border-slate-100 flex gap-2 shrink-0">
            <Button variant="secondary" fullWidth onClick={onClose}>
              Cancel
            </Button>
            <Button fullWidth disabled={ticked.size === 0} onClick={handleAdd}>
              Add ({ticked.size})
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
