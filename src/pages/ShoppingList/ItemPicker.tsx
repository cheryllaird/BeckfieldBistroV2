import { useId } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { PickRow } from './useItemTicks';

interface Props {
  rows: readonly PickRow[];
  isTicked: (row: PickRow) => boolean;
  onToggle: (row: PickRow) => void;
}

/** The items to add, each tickable, then the store cupboard staples being skipped. */
export function ItemPicker({ rows, isTicked, onToggle }: Props) {
  const inRouter = useInRouterContext();
  const toBuy = rows.filter((row) => !row.inCupboard);
  const cupboard = rows.filter((row) => row.inCupboard);
  const list = (items: readonly PickRow[]) => (
    <ul className="flex flex-col">
      {items.map((row) => (
        <li key={row.key}>
          <PickButton row={row} ticked={isTicked(row)} onToggle={() => onToggle(row)} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-3">
      {toBuy.length > 0 && (
        <section>
          <p className="text-xs font-medium text-slate-500 mb-1">Will add</p>
          {list(toBuy)}
        </section>
      )}
      {cupboard.length > 0 && (
        <section>
          <p className="text-xs font-medium text-slate-500 mb-1">In store cupboard</p>
          {list(cupboard)}
          {inRouter && (
            <Link to="/pantry" className="text-xs text-amber-600 hover:underline">
              To always buy something, take it out of your store cupboard
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function PickButton({ row, ticked, onToggle }: { row: PickRow; ticked: boolean; onToggle: () => void }) {
  const detailId = useId();
  return (
    <button
      role="checkbox"
      aria-checked={ticked}
      aria-label={row.label}
      aria-describedby={row.detail ? detailId : undefined}
      onClick={onToggle}
      className="flex items-center gap-3 w-full min-h-11 py-1.5 text-left"
    >
      <span
        className={[
          'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
          ticked ? 'bg-amber-500 border-amber-500' : 'border-slate-300',
        ].join(' ')}
      >
        {ticked && <Check size={12} className="text-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm truncate ${ticked ? 'text-slate-800' : 'text-slate-400'}`}>{row.label}</span>
        {row.detail && <span id={detailId} className="block text-xs text-slate-400 truncate">{row.detail}</span>}
      </span>
    </button>
  );
}
