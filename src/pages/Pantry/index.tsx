import { useState, useRef, useEffect } from 'react';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ChevronDown, Archive, GripVertical, ArrowUpDown } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { categorize, generateId, normalizeIngredientName } from '../../lib/utils';
import type { PantryItem, ShoppingCategory } from '../../types';

const CATEGORY_ORDER: ShoppingCategory[] = [
  'Vegetables',
  'Fruit',
  'Herbs & Spices',
  'Bakery',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry',
  'Frozen',
  'Beverages',
  'Other',
];

export function PantryPage() {
  const navigate = useNavigate();
  const { pantryItems, addPantryItem, updatePantryItem, removePantryItem, reorderPantryItems } = useStore();
  const [input, setInput] = useState('');
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const draggingItemIdRef = useRef<string | null>(null);
  const dropTargetIndexRef = useRef<number | null>(null);

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    const alreadyExists = pantryItems.some(
      (p) => p.normalizedName === normalizeIngredientName(name)
    );
    if (alreadyExists) { setInput(''); return; }
    addPantryItem({
      id: generateId(),
      name,
      normalizedName: normalizeIngredientName(name),
      category: categorize(name),
      createdAt: new Date().toISOString(),
    });
    setInput('');
  };

  const handleCategoryChange = (id: string, category: ShoppingCategory) => {
    const item = pantryItems.find((p) => p.id === id);
    if (!item || item.category === category) return;
    updatePantryItem({ ...item, category });
  };

  const handleAutoSort = () => {
    const sorted = [...pantryItems].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    );
    reorderPantryItems(sorted);
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
      const sourceIndex = pantryItems.findIndex((i) => i.id === itemId);
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        const items = [...pantryItems];
        const [moved] = items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, moved);
        reorderPantryItems(items);
      }
    }
    setDraggingItemId(null);
    setDropTargetIndex(null);
    draggingItemIdRef.current = null;
    dropTargetIndexRef.current = null;
  };

  const handleDragEndRef = useRef(handleDragEnd);
  handleDragEndRef.current = handleDragEnd;

  // Guaranteed fallback: clear drag state on any window-level touch end,
  // in case mobile browsers consume touchend before it reaches the hook's listeners.
  useEffect(() => {
    const onGlobalTouchEnd = () => {
      if (draggingItemIdRef.current !== null) handleDragEndRef.current();
    };
    window.addEventListener('touchend', onGlobalTouchEnd);
    window.addEventListener('touchcancel', onGlobalTouchEnd);
    return () => {
      window.removeEventListener('touchend', onGlobalTouchEnd);
      window.removeEventListener('touchcancel', onGlobalTouchEnd);
    };
  }, []);


  const displayItems = (() => {
    if (!draggingItemId || dropTargetIndex === null) return pantryItems;
    const sourceIndex = pantryItems.findIndex((i) => i.id === draggingItemId);
    if (sourceIndex === -1 || sourceIndex === dropTargetIndex) return pantryItems;
    const items = [...pantryItems];
    const [moved] = items.splice(sourceIndex, 1);
    items.splice(dropTargetIndex, 0, moved);
    return items;
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-slate-800">Store Cupboard</h2>
      </div>

      <p className="text-sm text-slate-400">
        Ingredients you always have in stock. These are skipped when generating your shopping list.
      </p>

      {/* Add item */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. olive oil, cumin, balsamic vinegar…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-colors"
        />
        <Button size="sm" onClick={handleAdd} disabled={!input.trim()} aria-label="Add">
          <Plus size={14} />
        </Button>
      </div>

      {/* Pantry list */}
      {pantryItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Archive size={40} className="text-slate-200" />
          <div>
            <p className="text-base font-semibold text-slate-700">Nothing here yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Add oils, spices, and staples you always have in stock.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {pantryItems.length > 1 && (
            <div className="flex justify-end">
              <button
                onClick={handleAutoSort}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 transition-colors py-0.5"
              >
                <ArrowUpDown size={11} /> Auto sort
              </button>
            </div>
          )}
          {displayItems.map((item, index) => (
            <PantryItemRow
              key={item.id}
              item={item}
              dragIndex={index}
              isBeingDragged={item.id === draggingItemId}
              onCategoryChange={(cat) => handleCategoryChange(item.id, cat)}
              onRemove={() => removePantryItem(item.id)}
              onDragStart={() => handleDragStart(item.id)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onGripPointerDown={() => handleDragStart(item.id)}
              onDragEnterAt={(idx) => handleDragEnter(idx)}
              onTouchDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PantryItemRow({
  item,
  dragIndex,
  isBeingDragged,
  onCategoryChange,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onGripPointerDown,
  onDragEnterAt,
  onTouchDragEnd,
}: {
  item: PantryItem;
  dragIndex: number;
  isBeingDragged: boolean;
  onCategoryChange: (category: ShoppingCategory) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onGripPointerDown: () => void;
  onDragEnterAt: (idx: number) => void;
  onTouchDragEnd: () => void;
}) {
  const fromGrip = useRef(false);
  const gripRef = useRef<HTMLSpanElement>(null);

  const { isTouchDragging } = useTouchDrag({
    gripRef,
    enabled: true,
    onStart: onGripPointerDown,
    onMoveOver: onDragEnterAt,
    onEnd: onTouchDragEnd,
  });

  return (
    <div
      data-drag-index={dragIndex}
      draggable={!isTouchDragging}
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
        'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border transition-all duration-150',
        isBeingDragged
          ? 'opacity-40 border-dashed border-amber-400 bg-amber-50/40 scale-[0.99]'
          : 'border-slate-100',
      ].join(' ')}
    >
      <span
        ref={gripRef}
        className="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing"
        onMouseDown={() => { fromGrip.current = true; }}
        onMouseUp={() => { fromGrip.current = false; }}
      >
        <GripVertical size={16} className="text-slate-300 pointer-events-none" />
      </span>

      <span className="text-sm text-slate-700 capitalize flex-1 min-w-0 truncate">
        {item.name}
      </span>

      <div className="relative inline-flex items-center shrink-0">
        <div className="flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-[10px] font-semibold pointer-events-none bg-slate-100 text-slate-500">
          {item.category}
          <ChevronDown size={9} />
        </div>
        <select
          value={item.category}
          onChange={(e) => onCategoryChange(e.target.value as ShoppingCategory)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label="Item category"
        >
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <button
        onClick={onRemove}
        className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
        aria-label={`Remove ${item.name}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
