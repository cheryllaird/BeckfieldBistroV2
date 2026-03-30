import { useState } from 'react';
import {
  ShoppingCart,
  Plus,
  Check,
  Trash2,
  Undo2,
  ArrowUpDown,
  ShoppingBag,
  Zap,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { categorize, generateId } from '../../lib/utils';
import type { ShoppingCategory, ShoppingItem } from '../../types';
import { GenerateListModal } from './GenerateListModal';
import { ShopMode } from './ShopMode';

type Mode = 'edit' | 'shop';

const CATEGORY_ORDER: ShoppingCategory[] = [
  'Produce',
  'Bakery',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry',
  'Frozen',
  'Beverages',
  'Other',
];

export function ShoppingListPage() {
  const {
    shoppingItems,
    toggleShoppingItem,
    addShoppingItem,
    removeShoppingItem,
    setShoppingItems,
    clearCheckedItems,
  } = useStore();

  const [mode, setMode] = useState<Mode>('edit');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [manualItem, setManualItem] = useState('');
  const [history, setHistory] = useState<ShoppingItem[][]>([]);

  const pushHistory = () => setHistory((h) => [...h, shoppingItems]);

  const handleToggle = (id: string) => {
    pushHistory();
    toggleShoppingItem(id);
  };

  const handleRemove = (id: string) => {
    pushHistory();
    removeShoppingItem(id);
  };

  const handleUndo = () => {
    const prev = history[history.length - 1];
    if (prev) {
      setShoppingItems(prev);
      setHistory((h) => h.slice(0, -1));
    }
  };

  const handleAutoSort = () => {
    pushHistory();
    const sorted = [...shoppingItems].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    );
    setShoppingItems(sorted);
  };

  const handleAddManual = () => {
    if (!manualItem.trim()) return;
    addShoppingItem({
      id: generateId(),
      name: manualItem.trim(),
      quantity: 1,
      unit: '',
      category: categorize(manualItem.trim()),
      checked: false,
      manual: true,
    });
    setManualItem('');
  };

  const unchecked = shoppingItems.filter((i) => !i.checked);
  const checked = shoppingItems.filter((i) => i.checked);

  if (mode === 'shop') {
    return (
      <ShopMode
        items={shoppingItems}
        onToggle={handleToggle}
        onUndo={handleUndo}
        canUndo={history.length > 0}
        onExit={() => setMode('edit')}
      />
    );
  }

  if (shoppingItems.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Shopping List</h2>
        </div>
        <div className="flex flex-col items-center gap-4 py-16 text-center animate-fade">
          <ShoppingCart size={48} className="text-slate-200" />
          <div>
            <p className="text-base font-semibold text-slate-700">Your list is empty</p>
            <p className="text-sm text-slate-400 mt-1">Generate from your meal plan to get started</p>
          </div>
          <Button onClick={() => setGenerateOpen(true)}>
            <Zap size={14} /> Generate from Plan
          </Button>
        </div>
        {generateOpen && <GenerateListModal onClose={() => setGenerateOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Shopping List</h2>
        <div className="flex gap-1.5">
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleUndo} aria-label="Undo">
              <Undo2 size={14} />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleAutoSort} aria-label="Auto-sort">
            <ArrowUpDown size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setGenerateOpen(true)}>
            <Zap size={14} /> Regenerate
          </Button>
          <Button size="sm" onClick={() => setMode('shop')}>
            <ShoppingBag size={14} /> Shop
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-300"
            style={{ width: `${shoppingItems.length > 0 ? (checked.length / shoppingItems.length) * 100 : 0}%` }}
          />
        </div>
        <span className="text-xs text-slate-400 shrink-0">
          {checked.length}/{shoppingItems.length}
        </span>
      </div>

      {/* Unchecked items */}
      <div className="flex flex-col gap-1">
        {unchecked.map((item) => (
          <ShoppingItemRow
            key={item.id}
            item={item}
            onToggle={() => handleToggle(item.id)}
            onRemove={() => handleRemove(item.id)}
          />
        ))}
      </div>

      {/* Manual add */}
      <div className="flex gap-2">
        <input
          value={manualItem}
          onChange={(e) => setManualItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
          placeholder="Add item manually…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-colors"
        />
        <Button size="sm" onClick={handleAddManual} disabled={!manualItem.trim()} aria-label="Add">
          <Plus size={14} />
        </Button>
      </div>

      {/* Checked items */}
      {checked.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              In basket ({checked.length})
            </span>
            <button
              onClick={() => { pushHistory(); clearCheckedItems(); }}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          </div>
          {checked.map((item) => (
            <ShoppingItemRow
              key={item.id}
              item={item}
              onToggle={() => handleToggle(item.id)}
              onRemove={() => handleRemove(item.id)}
            />
          ))}
        </div>
      )}

      {generateOpen && <GenerateListModal onClose={() => setGenerateOpen(false)} />}
    </div>
  );
}

function ShoppingItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200',
        item.checked
          ? 'bg-slate-50 border-slate-100 opacity-60'
          : 'bg-white border-slate-100',
      ].join(' ')}
    >
      <button
        onClick={onToggle}
        className={[
          'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          item.checked
            ? 'bg-amber-500 border-amber-500'
            : 'border-slate-300 hover:border-amber-400',
        ].join(' ')}
        aria-label={item.checked ? 'Uncheck' : 'Check'}
      >
        {item.checked && <Check size={10} className="text-white" />}
      </button>

      <span
        className={[
          'flex-1 text-sm',
          item.checked ? 'line-through text-slate-400' : 'text-slate-700',
        ].join(' ')}
      >
        {item.quantity > 0 && item.quantity !== 1 && (
          <span className="font-medium text-slate-900 mr-1">{item.quantity}</span>
        )}
        {item.unit && <span className="text-slate-500 mr-1">{item.unit}</span>}
        {item.name}
      </span>

      <Badge variant="default" size="sm">{item.category}</Badge>

      <button
        onClick={onRemove}
        className="text-slate-200 hover:text-red-400 transition-colors shrink-0"
        aria-label="Remove item"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
