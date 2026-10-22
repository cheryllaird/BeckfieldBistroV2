import { useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import type { PantrySkip } from '../../lib/ingredients';

interface Props {
  skipped: readonly PantrySkip[];
  /** Keys of the ingredients that are switched on (or already added). */
  added: ReadonlySet<string>;
  onAdd: (skip: PantrySkip) => void;
  /** When given, an added ingredient can be switched off again. */
  onRemove?: (skip: PantrySkip) => void;
}

/**
 * "N ingredients in store cupboard — skipped", opening to the ingredients by
 * name with an "Add anyway" button each. Shared by the Plan page and Generate list.
 */
export function PantrySkipList({ skipped, added, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const inRouter = useInRouterContext();
  if (skipped.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 text-xs text-slate-400">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start hover:text-slate-600 transition-colors"
      >
        <Package size={11} />
        {skipped.length} ingredient{skipped.length !== 1 ? 's' : ''} in store cupboard — skipped
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {open && (
        <ul className="flex flex-col gap-1">
          {skipped.map((skip) => {
            const isAdded = added.has(skip.key);
            const label = `${skip.ingredient.name} (cupboard: ${skip.pantryItem.name})`;
            return (
              <li key={skip.key} className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-slate-600">{label}</span>
                <button
                  onClick={() => (isAdded ? onRemove?.(skip) : onAdd(skip))}
                  disabled={isAdded && !onRemove}
                  aria-pressed={isAdded}
                  aria-label={`${isAdded ? 'Added' : 'Add anyway'}: ${skip.ingredient.name}`}
                  className={[
                    'shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors',
                    isAdded
                      ? 'bg-green-50 text-green-600'
                      : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700',
                  ].join(' ')}
                >
                  {isAdded ? 'Added' : 'Add anyway'}
                </button>
              </li>
            );
          })}
          {inRouter && (
            <li>
              <Link to="/pantry" className="text-amber-600 hover:underline">
                To always buy something, take it out of your store cupboard
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
