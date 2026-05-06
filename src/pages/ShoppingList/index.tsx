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
  UtensilsCrossed,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { categorize, formatQuantity, generateId } from '../../lib/utils';
import { logCategoryOverride } from '../../lib/firestore';
import type { MealSource, ShoppingCategory, ShoppingItem } from '../../types';
import { GenerateListModal } from './GenerateListModal';
import { ModalPortal } from '../../components/ui/ModalPortal';

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
    removeShoppingItem,
    setShoppingItems,
    reorderShoppingItems,
    clearCheckedItems,
    user,
  } = useStore();

  const [mode, setMode] = useState<Mode>('shop');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [manualItem, setManualItem] = useState('');
  const [history, setHistory] = useState<ShoppingItem[][]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const draggingItemIdRef = useRef<string | null>(null);
  const dropTargetIndexRef = useRef<number | null>(null);

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
    const newItem: ShoppingItem = {
      id: generateId(),
      name: manualItem.trim(),
      category: categorize(manualItem.trim()),
      checked: false,
      manual: true,
    };
    setShoppingItems([newItem, ...shoppingItems]);
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

  const handleCategoryChange = (id: string, category: ShoppingCategory) => {
    const item = shoppingItems.find((i) => i.id === id);
    if (!item || item.category === category) return;
    pushHistory();
    setShoppingItems(shoppingItems.map((i) => i.id === id ? { ...i, category } : i));
    if (user) {
      logCategoryOverride(user.uid, {
        itemName: item.name,
        fromCategory: item.category,
        toCategory: category,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleDragStart = (itemId: string) => {
    setDraggingItemId(itemId);
    draggingItemIdRef.current = itemId;
  };

  const handleDragEnter = (index: number) => {
    setDropTargetIndex(index);
    dropTargetIndexRef.current = index;
  };

  const handleDragEnd = () => {
    const itemId = draggingItemIdRef.current;
    const targetIndex = dropTargetIndexRef.current;
    if (itemId && targetIndex !== null) {
      const sourceIndex = unchecked.findIndex((i) => i.id === itemId);
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        pushHistory();
        const items = [...unchecked];
        const [moved] = items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, moved);
        reorderShoppingItems([...items, ...checked]);
      }
    }
    setDraggingItemId(null);
    setDropTargetIndex(null);
    draggingItemIdRef.current = null;
    dropTargetIndexRef.current = null;
  };

  const unchecked = shoppingItems.filter((i) => !i.checked);
  const checked = shoppingItems.filter((i) => i.checked);

  const previewUnchecked = (() => {
    if (!draggingItemId || dropTargetIndex === null) return unchecked;
    const sourceIndex = unchecked.findIndex((i) => i.id === draggingItemId);
    if (sourceIndex === -1 || sourceIndex === dropTargetIndex) return unchecked;
    const items = [...unchecked];
    const [moved] = items.splice(sourceIndex, 1);
    items.splice(dropTargetIndex, 0, moved);
    return items;
  })();

  if (shoppingItems.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Shopping List</h2>
        </div>
        <div className="flex flex-col items-center gap-4 py-10 text-center animate-fade">
          <ShoppingCart size={48} className="text-slate-200" />
          <div>
            <p className="text-base font-semibold text-slate-700">Your list is empty</p>
            <p className="text-sm text-slate-400 mt-1">Generate from your meal plan or add items manually</p>
          </div>
          <Button onClick={() => setGenerateOpen(true)}>
            <Zap size={14} /> Generate from Plan
          </Button>
        </div>
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

      {/* Progress (shop mode only) */}
      {mode === 'shop' && (
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
      )}

      {/* Manual add (edit mode only) */}
      {mode === 'edit' && (
        <>
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
        </>
      )}

      {/* Unchecked items */}
      <div className="flex flex-col gap-1">
        {(mode === 'shop' ? unchecked : previewUnchecked).map((item, index) =>
          mode === 'shop' ? (
            <ShopItem key={item.id} item={item} onToggle={() => handleToggle(item.id)} />
          ) : (
            <EditItem
              key={item.id}
              item={item}
              isDraggable={true}
              isBeingDragged={item.id === draggingItemId}
              isEditing={editingId === item.id}
              editingValue={editingValue}
              onEditStart={() => handleEditStart(item)}
              onEditChange={setEditingValue}
              onEditSave={() => handleEditSave(item.id)}
              onEditCancel={handleEditCancel}
              onRemove={() => handleRemove(item.id)}
              onCategoryChange={(cat) => handleCategoryChange(item.id, cat)}
              onDragStart={() => handleDragStart(item.id)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
            />
          )
        )}
      </div>

      {mode === 'edit' && unchecked.length > 0 && (
        <button
          onClick={() => { pushHistory(); setShoppingItems([]); }}
          className="text-xs text-slate-400 hover:text-red-500 transition-colors self-center"
        >
          Clear entire list
        </button>
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
                isDraggable={false}
                isBeingDragged={false}
                isEditing={editingId === item.id}
                editingValue={editingValue}
                onEditStart={() => handleEditStart(item)}
                onEditChange={setEditingValue}
                onEditSave={() => handleEditSave(item.id)}
                onEditCancel={handleEditCancel}
                onRemove={() => handleRemove(item.id)}
                onCategoryChange={(cat) => handleCategoryChange(item.id, cat)}
                onDragStart={() => {}}
                onDragEnter={() => {}}
                onDragEnd={() => {}}
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

function MealSourcesModal({
  sources,
  onClose,
}: {
  sources: MealSource[];
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl p-5 shadow-xl w-full max-w-xs flex flex-col gap-4 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Used in meals</p>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {sources.map((src, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-50 last:border-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <UtensilsCrossed size={13} className="text-amber-500" />
                  </div>
                  <span className="text-sm text-slate-700 truncate">{src.recipeTitle}</span>
                </div>
                <span className="text-xs text-slate-400 shrink-0 font-medium">
                  {src.scaledQuantity > 0 ? formatQuantity(src.scaledQuantity) : ''}
                  {src.unit ? ` ${src.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function EditItem({
  item,
  isDraggable,
  isBeingDragged,
  isEditing,
  editingValue,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onRemove,
  onCategoryChange,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  item: ShoppingItem;
  isDraggable: boolean;
  isBeingDragged: boolean;
  isEditing: boolean;
  editingValue: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRemove: () => void;
  onCategoryChange: (category: ShoppingCategory) => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  const fromGrip = useRef(false);

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => {
        if (!fromGrip.current) { e.preventDefault(); return; }
        onDragStart();
      }}
      onDragEnter={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragEnter();
      }}
      onDragEnd={() => {
        fromGrip.current = false;
        onDragEnd();
      }}
      onDragOver={(e) => e.preventDefault()}
      className={[
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150',
        item.checked ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100',
        isBeingDragged ? 'opacity-40 border-dashed border-amber-400 bg-amber-50/40 scale-[0.99]' : '',
      ].join(' ')}
    >
      {isDraggable && (
        <GripVertical
          size={16}
          className="text-slate-300 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={() => { fromGrip.current = true; }}
          onPointerUp={() => { fromGrip.current = false; }}
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

      <select
        value={item.category}
        onChange={(e) => onCategoryChange(e.target.value as ShoppingCategory)}
        onClick={(e) => e.stopPropagation()}
        className="text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer hover:bg-amber-200 transition-colors focus:outline-none focus:ring-1 focus:ring-amber-400 shrink-0"
      >
        {CATEGORY_ORDER.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>

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
