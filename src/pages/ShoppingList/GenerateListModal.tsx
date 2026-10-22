import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { getRecipeIngredients, isoDate, getWeekDays } from '../../lib/utils';
import { consolidateIngredients, splitByPantry, type IngredientGroup, type PantrySkip } from '../../lib/ingredients';
import { PantrySkipList } from './PantrySkipList';

interface Props {
  onClose: () => void;
}

export function GenerateListModal({ onClose }: Props) {
  const { mealEntries, recipes, pantryItems, categoryOverrides, shoppingItems, setShoppingItems } = useStore();

  const allWeekDays = [...getWeekDays(0), ...getWeekDays(1)];
  const plannedEntries = mealEntries.filter((e) =>
    allWeekDays.some((d) => isoDate(d) === e.date)
  );

  const recipeEntries = plannedEntries.filter(
    (e) => e.type === 'recipe' && e.recipeId
  );

  const [selected, setSelected] = useState<Set<string>>(
    new Set(recipeEntries.map((e) => e.id))
  );

  // Cupboard staples the user has switched on for this generate only.
  const [keepKeys, setKeepKeys] = useState<Set<string>>(new Set());

  // The selected meals' ingredients, split into what to buy and what the store
  // cupboard covers, then consolidated.
  const splits = recipeEntries
    .filter((e) => selected.has(e.id))
    .flatMap((e) => {
      const recipe = recipes.find((r) => r.id === e.recipeId);
      if (!recipe) return [];
      return [{ entry: e, recipe, ...splitByPantry(getRecipeIngredients(recipe), pantryItems, keepKeys) }];
    });
  const groups: IngredientGroup[] = splits.map(({ entry, recipe, toBuy }) => ({
    ingredients: toBuy,
    servings: entry.servings,
    originalServings: recipe.servings,
    mealEntryId: entry.id,
    recipeTitle: recipe.title,
  }));
  const toBuy = consolidateIngredients(groups, categoryOverrides);
  const skipped: PantrySkip[] = [
    ...new Map(splits.flatMap((s) => s.skipped).map((skip) => [skip.key, skip])).values(),
  ];

  const setKept = (key: string, kept: boolean) =>
    setKeepKeys((prev) => {
      const next = new Set(prev);
      if (kept) { next.add(key); } else { next.delete(key); }
      return next;
    });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  const handleGenerate = () => {
    // Generated items always populate the Immediate list.
    const items = toBuy.map((item) => ({ ...item, listType: 'immediate' as const }));
    // Replace only the Immediate list; leave Stock up items untouched.
    const stockUp = shoppingItems.filter(
      (i) => (i.listType ?? 'immediate') === 'stock-up'
    );
    setShoppingItems([...items, ...stockUp]);
    onClose();
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col max-h-[90dvh] animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <h3 className="text-base font-semibold text-slate-800">Generate Shopping List</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {recipeEntries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No recipe meals planned for this week. Add some meals to your plan first.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 mb-1">
                Select meals to add to your <span className="font-medium text-slate-600">Immediate</span> list:
              </p>
              {recipeEntries.map((entry) => {
                const recipe = recipes.find((r) => r.id === entry.recipeId);
                if (!recipe) return null;
                const dayLabel = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                });
                return (
                  <button
                    key={entry.id}
                    onClick={() => toggle(entry.id)}
                    className={[
                      'flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full',
                      selected.has(entry.id)
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-100 bg-white hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                        selected.has(entry.id)
                          ? 'bg-amber-500 border-amber-500'
                          : 'border-slate-300',
                      ].join(' ')}
                    >
                      {selected.has(entry.id) && <Check size={10} className="text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{recipe.title}</p>
                      <p className="text-xs text-slate-400">
                        {dayLabel} · {entry.servings} servings
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {skipped.length > 0 && (
            <div className="mt-3">
              <PantrySkipList
                skipped={skipped}
                added={keepKeys}
                onAdd={(skip) => setKept(skip.key, true)}
                onRemove={(skip) => setKept(skip.key, false)}
              />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-2 shrink-0">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            disabled={selected.size === 0}
            onClick={handleGenerate}
          >
            Generate ({selected.size})
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
