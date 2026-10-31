import { useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';
import type { PantryItem, ShoppingCategory } from '../../types';
import { CATEGORY_ORDER } from './categoryOrder';

// Bottom sheet for the less frequent store cupboard edits, matching the
// shopping list's item sheet. Changes apply as soon as they are made.
export function PantryItemSheet({
  item,
  onCategoryChange,
  onRemove,
  onClose,
}: {
  item: PantryItem;
  onCategoryChange: (category: ShoppingCategory) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 animate-fade" onClick={onClose}>
        <div
          role="dialog"
          aria-label="Edit store cupboard item"
          className="w-full max-w-md bg-white rounded-t-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-5 shadow-xl animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1">
            <span className="self-center w-10 h-1 rounded-full bg-slate-200" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-slate-900 capitalize truncate">{item.name}</p>
              <button onClick={onClose} className="min-h-11 px-2 -mr-2 text-sm font-semibold text-amber-600 shrink-0">
                Done
              </button>
            </div>
          </div>

          <section className="flex flex-col gap-2">
            <p className="text-xs font-medium text-slate-500">Category</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
              {CATEGORY_ORDER.map((cat) => (
                <button
                  key={cat}
                  aria-pressed={item.category === cat}
                  onClick={() => onCategoryChange(cat)}
                  className={[
                    'min-h-10 px-3.5 rounded-full text-sm border transition-colors',
                    item.category === cat
                      ? 'bg-amber-soft border-amber-400 text-amber-700 font-semibold'
                      : 'bg-white border-slate-200 text-slate-600',
                  ].join(' ')}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          <button
            onClick={onRemove}
            className="flex items-center justify-center gap-2 min-h-11 rounded-xl text-sm font-medium text-red-500 bg-red-50 active:bg-red-100"
          >
            <Trash2 size={16} /> Remove from store cupboard
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
