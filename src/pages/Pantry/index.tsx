import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Archive, ArrowUpDown } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { generateId } from '../../lib/utils';
import { categorize, categoryKey, normalizeIngredientName } from '../../lib/ingredients';
import type { ShoppingCategory } from '../../types';
import { PantryItemRow } from './PantryItemRow';
import { CATEGORY_ORDER } from './categoryOrder';

export function PantryPage() {
  const navigate = useNavigate();
  const {
    pantryItems,
    categoryOverrides,
    addPantryItem,
    updatePantryItem,
    removePantryItem,
    reorderPantryItems,
    rememberCategory,
  } = useStore();
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
      category: categorize(name, categoryOverrides),
      createdAt: new Date().toISOString(),
    });
    setInput('');
  };

  const handleCategoryChange = (id: string, category: ShoppingCategory) => {
    const item = pantryItems.find((p) => p.id === id);
    if (!item || item.category === category) return;
    updatePantryItem({ ...item, category });
    rememberCategory({
      itemName: item.name,
      ingredientKey: categoryKey(item.name),
      fromCategory: item.category,
      toCategory: category,
      source: 'pantry',
    });
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
    // Clear visual state first so the item never stays looking dragged.
    setDraggingItemId(null);
    setDropTargetIndex(null);
    draggingItemIdRef.current = null;
    dropTargetIndexRef.current = null;
    if (itemId && targetIndex !== null) {
      const sourceIndex = pantryItems.findIndex((i) => i.id === itemId);
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        const items = [...pantryItems];
        const [moved] = items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, moved);
        reorderPantryItems(items);
      }
    }
  };

  const handleDragEndRef = useRef(handleDragEnd);
  useLayoutEffect(() => {
    handleDragEndRef.current = handleDragEnd;
  });

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
        <h2 className="text-xl font-bold text-slate-800">Store cupboard</h2>
      </div>

      <p className="text-sm text-slate-400">
        Ingredients you always have in stock. These are skipped when adding meals to your shopping list. Switch one off when you run out.
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
