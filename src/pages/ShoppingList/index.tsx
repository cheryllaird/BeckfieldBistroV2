import { useState, useRef } from 'react';
import {
  ShoppingCart,
  Plus,
  Check,
  X,
  Undo2,
  ArrowUpDown,
  Zap,
  GripVertical,
  ShoppingBag,
  Pencil,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { categorize, generateId } from '../../lib/utils';
import type { ShoppingCategory, ShoppingItem } from '../../types';
import { GenerateListModal } from './GenerateListModal';

type Mode = 'shop' | 'edit';

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
    reorderShoppingItems,
    clearCheckedItems,
  } = useStore();

  const [mode, setMode] = useState<Mode>('shop');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [manualItem, setManualItem] = useState('');
  const [history, setHistory] = useState<ShoppingItem[][]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

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
      category: categorize(manualItem.trim()),
      checked: false,
      manual: true,
    });
    setManualItem('');
  };

  const handleEditStart = (item: ShoppingItem) => {
    setEditingId(item.id);
    setEditingValue(item.name);
  };

  const handleEditSave = (id: string) => {
    if (editingValue.trim()) {
      pushHistory();
      setShoppingItems(
        shoppingItems.map((item) =>
          item.id === id ? { ...item, name: editingValue.trim() } : item
        )
      );
    }
    setEditingId(null);
    setEditingValue('');
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (
      dragItem.current !== null &&
      dragOverItem.current !== null &&
      dragItem.current !== dragOverItem.current
    ) {
      pushHistory();
      const unchecked = shoppingItems.filter((i) => !i.checked);
      const checked = shoppingItems.filter((i) => i.checked);
      const reordered = [...unchecked];
      const [moved] = reordered.splice(dragItem.current, 1);
      reordered.splice(dragOverItem.current, 0, moved);
      reorderShoppingItems([...reordered, ...checked]);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragOverIndex(null);
  };

  const unchecked = shoppingItems.filter((i) => !i.checked);
  const checked = shoppingItems.filter((i) => i.checked);

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
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-800 shrink-0">Shopping List</h2>
        <div className="flex items-center gap-1.5">
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleUndo} aria-label="Undo">
              <Undo2 size={14} />
            </Button>
          )}
          {mode === 'edit' && (
            <Button variant="ghost" size="sm" onClick={handleAutoSort} aria-label="Auto-sort">
              <ArrowUpDown size={14} />
            </Button>
          )}
          {/* Tab switcher */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-0.5">
            <button
              onClick={() => setMode('shop')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                mode === 'shop'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <ShoppingBag size={12} /> Shop
            </button>
            <button
              onClick={() => setMode('edit')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                mode === 'edit'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <Pencil size={12} /> Edit
            </button>
          </div>
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
        {unchecked.map((item, index) =>
          mode === 'shop' ? (
            <ShopItem key={item.id} item={item} onToggle={() => handleToggle(item.id)} />
          ) : (
            <EditItem
              key={item.id}
              item={item}
              isDragOver={dragOverIndex === index}
              isEditing={editingId === item.id}
              editingValue={editingValue}
              onEditStart={() => handleEditStart(item)}
              onEditChange={setEditingValue}
              onEditSave={() => handleEditSave(item.id)}
              onEditCancel={handleEditCancel}
              onRemove={() => handleRemove(item.id)}
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              draggable
            />
          )
        )}
      </div>

      {/* Manual add (edit mode only) */}
      {mode === 'edit' && (
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
      )}

      {/* Checked / In basket */}
      {checked.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              In basket ({checked.length})
            </span>
            {mode === 'edit' && (
              <button
                onClick={() => { pushHistory(); clearCheckedItems(); }}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          {checked.map((item) =>
            mode === 'shop' ? (
              <ShopItem key={item.id} item={item} onToggle={() => handleToggle(item.id)} />
            ) : (
              <EditItem
                key={item.id}
                item={item}
                isDragOver={false}
                isEditing={editingId === item.id}
                editingValue={editingValue}
                onEditStart={() => handleEditStart(item)}
                onEditChange={setEditingValue}
                onEditSave={() => handleEditSave(item.id)}
                onEditCancel={handleEditCancel}
                onRemove={() => handleRemove(item.id)}
                onDragStart={() => {}}
                onDragEnter={() => {}}
                onDragEnd={() => {}}
                draggable={false}
              />
            )
          )}
        </div>
      )}

      {generateOpen && <GenerateListModal onClose={() => setGenerateOpen(false)} />}
    </div>
  );
}

function ShopItem({
  item,
  onToggle,
}: {
  item: ShoppingItem;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 text-left w-full active:scale-[0.98]',
        item.checked
          ? 'bg-slate-50 border-slate-100 opacity-60'
          : 'bg-white border-slate-200 shadow-sm hover:border-amber-300',
      ].join(' ')}
    >
      <div
        className={[
          'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          item.checked ? 'bg-amber-500 border-amber-500' : 'border-slate-300',
        ].join(' ')}
      >
        {item.checked && <Check size={12} className="text-white" />}
      </div>
      <span
        className={[
          'text-sm font-medium flex-1 text-left',
          item.checked ? 'line-through text-slate-400' : 'text-slate-800',
        ].join(' ')}
      >
        {item.name}
      </span>
      <Badge variant="default" size="sm">{item.category}</Badge>
    </button>
  );
}

function EditItem({
  item,
  draggable,
  isDragOver,
  isEditing,
  editingValue,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  item: ShoppingItem;
  draggable: boolean;
  isDragOver: boolean;
  isEditing: boolean;
  editingValue: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150',
        item.checked ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100',
        isDragOver ? 'border-amber-400 shadow-sm scale-[1.01]' : '',
      ].join(' ')}
    >
      {draggable && (
        <GripVertical
          size={16}
          className="text-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none"
        />
      )}

      {isEditing ? (
        <input
          autoFocus
          value={editingValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditSave();
            if (e.key === 'Escape') onEditCancel();
          }}
          className="flex-1 text-sm text-slate-800 bg-transparent border-b border-amber-400 outline-none py-0.5"
        />
      ) : (
        <button
          onClick={onEditStart}
          className={[
            'flex-1 text-sm text-left',
            item.checked ? 'line-through text-slate-400' : 'text-slate-700 hover:text-slate-900',
          ].join(' ')}
        >
          {item.name}
        </button>
      )}

      <Badge variant="default" size="sm">{item.category}</Badge>

      <button
        onClick={onRemove}
        className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
        aria-label="Remove item"
      >
        <X size={15} />
      </button>
    </div>
  );
}
