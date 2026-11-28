import type { Dispatch, SetStateAction } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Recipe } from '../../types';
import { scaleIngredient } from '../../lib/utils';
import { formatQuantity } from '../../lib/ingredients';

interface IngredientsTabProps {
  recipe: Recipe;
  servings: number;
  setServings: Dispatch<SetStateAction<number>>;
}

export function IngredientsTab({ recipe, servings, setServings }: IngredientsTabProps) {
  const sectionsToDisplay = recipe.ingredientSections?.length
    ? recipe.ingredientSections
    : [{ title: '', ingredients: recipe.ingredients }];

  return (
    <div>
      {/* Serving adjuster */}
      <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
        <span className="text-sm font-medium text-slate-700">Adjust servings</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-sm"
            aria-label="Decrease servings"
          >
            <Minus size={13} />
          </button>
          <span className="text-base font-bold text-amber-700 w-6 text-center">
            {servings}
          </span>
          <button
            onClick={() => setServings((s) => s + 1)}
            className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-sm"
            aria-label="Increase servings"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Ingredient sections */}
      <div className="flex flex-col gap-4">
        {sectionsToDisplay.map((section, sIdx) => (
          <div key={sIdx}>
            {section.title && (
              <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                {section.title}
              </h4>
            )}
            <ul className="flex flex-col divide-y divide-slate-100">
              {section.ingredients.map((ing, index) => {
                const scaled = scaleIngredient(ing, recipe.servings, servings);
                return (
                  <li key={index} className="flex items-baseline justify-between py-2.5">
                    <span className="text-sm text-slate-700">{scaled.name}</span>
                    <span className="text-sm font-medium text-slate-900 ml-4 shrink-0">
                      {scaled.quantity > 0 ? formatQuantity(scaled.quantity) : ''}{' '}
                      {scaled.unit}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
