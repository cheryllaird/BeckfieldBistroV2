import { useState } from 'react';
import { Check, UtensilsCrossed } from 'lucide-react';
import type { ShoppingItem } from '../../types';
import { MealSourcesModal } from './MealSourcesModal';

export function ShopItem({
  item,
  onToggle,
}: {
  item: ShoppingItem;
  onToggle: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const hasSources = (item.mealSources?.length ?? 0) > 0;

  return (
    <>
      {sourcesOpen && hasSources && (
        <MealSourcesModal
          sources={item.mealSources!}
          onClose={() => setSourcesOpen(false)}
        />
      )}
      <div
        className={[
          'flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-150',
          item.checked
            ? 'bg-slate-50 border-slate-100 opacity-60'
            : 'bg-white border-slate-100 hover:border-amber-300',
        ].join(' ')}
      >
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 text-left active:scale-[0.98] min-w-0"
        >
          <div
            className={[
              'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
              item.checked ? 'bg-amber-500 border-amber-500' : 'border-slate-300',
            ].join(' ')}
          >
            {item.checked && <Check size={10} className="text-white" />}
          </div>
          <span
            className={[
              'text-sm flex-1 text-left',
              item.checked ? 'line-through text-slate-400' : 'text-slate-700',
            ].join(' ')}
          >
            {item.name}
          </span>
        </button>
        {hasSources && (
          <button
            onClick={() => setSourcesOpen(true)}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
            aria-label="View meal sources"
          >
            <UtensilsCrossed size={12} />
          </button>
        )}
      </div>
    </>
  );
}
