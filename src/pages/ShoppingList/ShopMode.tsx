import { ArrowLeft, Undo2, Check } from 'lucide-react';
import type { ShoppingItem } from '../../types';

interface Props {
  items: ShoppingItem[];
  onToggle: (id: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  onExit: () => void;
}

export function ShopMode({ items, onToggle, onUndo, canUndo, onExit }: Props) {
  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const total = items.length;
  const doneCount = checked.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={16} /> Exit Shop Mode
        </button>
        {canUndo && (
          <button
            onClick={onUndo}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <Undo2 size={14} /> Undo
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <span className="font-semibold text-slate-800">
            {total === doneCount ? '🎉 All done!' : `${unchecked.length} remaining`}
          </span>
          <span className="text-slate-400">{doneCount}/{total}</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Unchecked — big tap targets */}
      <div className="flex flex-col gap-2">
        {unchecked.map((item) => (
          <ShopItem key={item.id} item={item} onToggle={onToggle} />
        ))}
      </div>

      {/* Checked */}
      {checked.length > 0 && (
        <div className="flex flex-col gap-1 opacity-50">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            In basket
          </p>
          {checked.map((item) => (
            <ShopItem key={item.id} item={item} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShopItem({
  item,
  onToggle,
}: {
  item: ShoppingItem;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(item.id)}
      className={[
        'flex items-center gap-4 px-4 py-4 rounded-2xl border transition-all duration-200 text-left w-full active:scale-[0.98]',
        item.checked
          ? 'bg-slate-50 border-slate-100'
          : 'bg-white border-slate-200 shadow-sm hover:border-amber-300',
      ].join(' ')}
    >
      <div
        className={[
          'w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          item.checked
            ? 'bg-amber-500 border-amber-500'
            : 'border-slate-300',
        ].join(' ')}
      >
        {item.checked && <Check size={14} className="text-white" />}
      </div>
      <span
        className={[
          'text-base font-medium flex-1',
          item.checked ? 'line-through text-slate-400' : 'text-slate-800',
        ].join(' ')}
      >
        {item.quantity > 0 && item.quantity !== 1 && (
          <span className="text-slate-500 mr-1">{item.quantity}</span>
        )}
        {item.unit && <span className="text-slate-500 mr-1">{item.unit}</span>}
        {item.name}
      </span>
    </button>
  );
}
