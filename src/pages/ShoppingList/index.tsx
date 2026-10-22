import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useSwipeNavigate } from '../../hooks/useSwipeNavigate';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Check,
  X,
  Undo2,
  ArrowUpDown,
  Zap,
  ShoppingBag,
  Pencil,
  UtensilsCrossed,
  ChevronRight,
  Package,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { generateId } from '../../lib/utils';
import { categorize, formatQuantity, itemCategoryKey } from '../../lib/ingredients';
import type { MealSource, ShoppingCategory, ShoppingItem, ShoppingListType } from '../../types';
import { GenerateListModal } from './GenerateListModal';
import { EditItem } from './EditItem';
import { CATEGORY_ORDER } from './categoryOrder';
import { ModalPortal } from '../../components/ui/ModalPortal';

type Mode = 'shop' | 'edit';

const LIST_TABS: { id: ShoppingListType; label: string }[] = [
  { id: 'immediate', label: 'Immediate' },
  { id: 'stock-up', label: 'Stock up' },
];

const listTypeOf = (item: ShoppingItem): ShoppingListType => item.listType ?? 'immediate';

export function ShoppingListPage() {
  const navigate = useNavigate();
  const {
    shoppingItems,
    toggleShoppingItem,
    removeShoppingItem,
    moveShoppingItem,
    setShoppingItems,
    reorderShoppingItems,
    categoryOverrides,
    rememberCategory,
  } = useStore();

  const [mode, setMode] = useState<Mode>('shop');
  const [activeList, setActiveList] = useState<ShoppingListType>('immediate');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [manualItem, setManualItem] = useState('');
  const [history, setHistory] = useState<ShoppingItem[][]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const draggingItemIdRef = useRef<string | null>(null);
  const dropTargetIndexRef = useRef<number | null>(null);
  // Swipe-between-lists gesture. The inner listBodyRef element slides.
  const listBodyRef = useRef<HTMLDivElement>(null);

  const pushHistory = () => setHistory((h) => [...h, shoppingItems]);

  const listItems = shoppingItems.filter((i) => listTypeOf(i) === activeList);
  const unchecked = listItems.filter((i) => !i.checked);
  const checked = listItems.filter((i) => i.checked);

  // Rebuild the full shoppingItems array from a reordered/sorted copy of the
  // active list, leaving the inactive list's items in their existing slots so
  // they aren't dragged into spurious order-conflict patches. `nextActive` must
  // be a permutation of the active-list items (same set, new order).
  const withActiveList = (nextActive: ShoppingItem[]): ShoppingItem[] => {
    const queue = [...nextActive];
    return shoppingItems.map((i) => (listTypeOf(i) === activeList ? queue.shift()! : i));
  };

  const handleToggle = (id: string) => {
    pushHistory();
    toggleShoppingItem(id);
  };

  const handleRemove = (id: string) => {
    pushHistory();
    removeShoppingItem(id);
  };

  const handleMove = (id: string) => {
    const item = shoppingItems.find((i) => i.id === id);
    if (!item) return;
    pushHistory();
    moveShoppingItem(id, listTypeOf(item) === 'immediate' ? 'stock-up' : 'immediate');
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
    const sorted = [...listItems].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    );
    setShoppingItems(withActiveList(sorted));
  };

  const handleAddManual = () => {
    if (!manualItem.trim()) return;
    // Manually typed items are always added — the store cupboard only filters
    // ingredients pulled in from recipes.
    const newItem: ShoppingItem = {
      id: generateId(),
      name: manualItem.trim(),
      category: categorize(manualItem.trim(), categoryOverrides),
      listType: activeList,
      checked: false,
      manual: true,
    };
    setManualItem('');
    setShoppingItems([newItem, ...shoppingItems]);
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
    // The choice is remembered per ingredient, so move every line of it —
    // on either list — not just the one that was tapped.
    const key = itemCategoryKey(item);
    setShoppingItems(
      shoppingItems.map((i) => (i.id === id || itemCategoryKey(i) === key ? { ...i, category } : i))
    );
    rememberCategory({
      itemName: item.name,
      ingredientKey: key,
      fromCategory: item.category,
      toCategory: category,
      source: 'shopping-list',
    });
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
      const sourceIndex = unchecked.findIndex((i) => i.id === itemId);
      if (sourceIndex !== -1 && sourceIndex !== targetIndex) {
        pushHistory();
        const items = [...unchecked];
        const [moved] = items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, moved);
        reorderShoppingItems(withActiveList([...items, ...checked]));
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

  const previewUnchecked = (() => {
    if (!draggingItemId || dropTargetIndex === null) return unchecked;
    const sourceIndex = unchecked.findIndex((i) => i.id === draggingItemId);
    if (sourceIndex === -1 || sourceIndex === dropTargetIndex) return unchecked;
    const items = [...unchecked];
    const [moved] = items.splice(sourceIndex, 1);
    items.splice(dropTargetIndex, 0, moved);
    return items;
  })();

  const activeIndex = LIST_TABS.findIndex((t) => t.id === activeList);

  // Horizontal swipe over the list body switches between Immediate / Stock up.
  const swipe = useSwipeNavigate({
    contentRef: listBodyRef,
    canGoNext: activeIndex < LIST_TABS.length - 1,
    canGoPrev: activeIndex > 0,
    onNext: () => setActiveList(LIST_TABS[activeIndex + 1].id),
    onPrev: () => setActiveList(LIST_TABS[activeIndex - 1].id),
  });

  return (
    // flex-1 so the page fills the layout's <main>; the swipe body below then
    // stretches to the bottom of the screen even when the list is short.
    <div className="flex-1 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-800 shrink-0">Shopping List</h2>
          <div className="flex items-center gap-1.5">
          {history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleUndo} aria-label="Undo">
              <Undo2 size={14} />
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
        <button
          onClick={() => navigate('/pantry')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-600 transition-colors self-start"
        >
          View store cupboard <ChevronRight size={12} />
        </button>
      </div>

      {/* List tabs: Immediate / Stock up */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {LIST_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveList(id)}
            className={[
              'flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium rounded-lg transition-all',
              activeList === id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Swipeable list body — swipe left/right to switch between lists.
          flex-1 (with the default min-height:auto, so long lists still push the
          page taller instead of being clipped) makes the gesture target run to
          the bottom of the screen, so a short list is still swipeable. */}
      <div className="flex-1 flex flex-col overflow-hidden" {...swipe}>
      <div ref={listBodyRef} className="flex-1 flex flex-col gap-4">
      {listItems.length === 0 ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-4 py-10 text-center animate-fade">
            {activeList === 'immediate' ? (
              <ShoppingCart size={48} className="text-slate-200" />
            ) : (
              <Package size={48} className="text-slate-200" />
            )}
            <div>
              <p className="text-base font-semibold text-slate-700">
                Your {activeList === 'immediate' ? 'Immediate' : 'Stock up'} list is empty
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {activeList === 'immediate'
                  ? 'Generate from your meal plan or add items manually'
                  : 'Add items you want to keep topped up'}
              </p>
            </div>
            {activeList === 'immediate' && (
              <Button onClick={() => setGenerateOpen(true)}>
                <Zap size={14} /> Generate from Plan
              </Button>
            )}
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
        </div>
      ) : (
      <>
      {/* Progress (shop mode only) */}
      {mode === 'shop' && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-300"
              style={{ width: `${listItems.length > 0 ? (checked.length / listItems.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 shrink-0">
            {checked.length}/{listItems.length}
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
        {mode === 'edit' && unchecked.length > 1 && (
          <div className="flex justify-end">
            <button
              onClick={handleAutoSort}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 transition-colors py-0.5"
            >
              <ArrowUpDown size={11} /> Auto sort
            </button>
          </div>
        )}
        {(mode === 'shop' ? unchecked : previewUnchecked).map((item, index) =>
          mode === 'shop' ? (
            <ShopItem key={item.id} item={item} onToggle={() => handleToggle(item.id)} />
          ) : (
            <EditItem
              key={item.id}
              item={item}
              isDraggable={true}
              dragIndex={index}
              isBeingDragged={item.id === draggingItemId}
              isEditing={editingId === item.id}
              editingValue={editingValue}
              onEditStart={() => handleEditStart(item)}
              onEditChange={setEditingValue}
              onEditSave={() => handleEditSave(item.id)}
              onEditCancel={handleEditCancel}
              onRemove={() => handleRemove(item.id)}
              onMove={() => handleMove(item.id)}
              onCategoryChange={(cat) => handleCategoryChange(item.id, cat)}
              onDragStart={() => handleDragStart(item.id)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onGripPointerDown={() => handleDragStart(item.id)}
              onDragEnterAt={(idx) => handleDragEnter(idx)}
              onTouchDragEnd={handleDragEnd}
            />
          )
        )}
      </div>

      {/* Checked / In basket */}
      {checked.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              In basket ({checked.length})
            </span>
            {mode === 'edit' && (
              <button
                onClick={() => {
                  pushHistory();
                  // Clear only the active list's checked items (the store's
                  // clearCheckedItems would clear both lists).
                  setShoppingItems(
                    shoppingItems.filter(
                      (i) => !(i.checked && listTypeOf(i) === activeList)
                    )
                  );
                }}
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
              onMove={() => handleMove(item.id)}
                onCategoryChange={(cat) => handleCategoryChange(item.id, cat)}
                onDragStart={() => {}}
                onDragEnter={() => {}}
                onDragEnd={() => {}}
                onGripPointerDown={() => {}}
                onDragEnterAt={() => {}}
                onTouchDragEnd={() => {}}
              />
            )
          )}
        </div>
      )}
      </>
      )}
      </div>
      </div>

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
