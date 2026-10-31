import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';
import type { ShoppingCategory, ShoppingItem, ShoppingListType } from '../../types';
import { CATEGORY_ORDER } from './categoryOrder';

const LISTS: { id: ShoppingListType; label: string }[] = [
  { id: 'immediate', label: 'Immediate' },
  { id: 'stock-up', label: 'Stock up' },
];

// Bottom sheet holding every per-item edit. Changes apply as soon as they are
// made (no Save button); the page's undo covers mistakes.
export function ItemSheet({
  item,
  onRename,
  onCategoryChange,
  onMove,
  onRemove,
  onClose,
}: {
  item: ShoppingItem;
  onRename: (name: string) => void;
  onCategoryChange: (category: ShoppingCategory) => void;
  onMove: (to: ShoppingListType) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const currentList = item.listType ?? 'immediate';

  const commitName = () => {
    const next = name.trim();
    if (next && next !== item.name) onRename(next);
    else setName(item.name);
  };

  const close = () => {
    commitName();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 animate-fade" onClick={close}>
        <div
          role="dialog"
          aria-label="Edit item"
          className="w-full max-w-md bg-white rounded-t-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-5 shadow-xl animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-1">
            <span className="self-center w-10 h-1 rounded-full bg-slate-200" aria-hidden />
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Edit item</p>
              <button onClick={close} className="min-h-11 px-2 -mr-2 text-sm font-semibold text-amber-600">
                Done
              </button>
            </div>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            aria-label="Item name"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />

          <section className="flex flex-col gap-2">
            <p className="text-xs font-medium text-slate-500">List</p>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1" role="group" aria-label="List">
              {LISTS.map(({ id, label }) => (
                <button
                  key={id}
                  aria-pressed={currentList === id}
                  onClick={() => currentList !== id && onMove(id)}
                  className={[
                    'flex-1 min-h-11 text-sm font-medium rounded-lg transition-all',
                    currentList === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

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
            <Trash2 size={16} /> Remove item
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
