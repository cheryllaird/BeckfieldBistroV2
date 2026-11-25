import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useSwipeNavigate } from '../../hooks/useSwipeNavigate';
import { useNavigate } from 'react-router-dom';
import { Undo2, ArrowUpDown, ShoppingBag, Pencil, ChevronRight } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { generateId } from '../../lib/utils';
import { categorize, itemCategoryKey } from '../../lib/ingredients';
import type { ShoppingCategory, ShoppingItem, ShoppingListType } from '../../types';
import { GenerateListModal } from './GenerateListModal';
import { EditItem } from './EditItem';
import { ItemSheet } from './ItemSheet';
import { UndoToast } from './UndoToast';
import { CATEGORY_ORDER } from './categoryOrder';
import { ShopItem } from './ShopItem';
import { EmptyListState } from './EmptyListState';
import { ManualAddInput } from './ManualAddInput';

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
  const [sheetItemId, setSheetItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const showToast = (message: string) => setToast({ id: Date.now(), message });
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

  // The item leaves the list in view, so close the sheet and say where it went.
  const handleMove = (id: string, to: ShoppingListType) => {
    const item = shoppingItems.find((i) => i.id === id);
    if (!item || listTypeOf(item) === to) return;
    pushHistory();
    moveShoppingItem(id, to);
    setSheetItemId(null);
    showToast(`Moved to ${to === 'stock-up' ? 'Stock up' : 'Immediate'}`);
  };

  const handleSheetRemove = (id: string) => {
    const item = shoppingItems.find((i) => i.id === id);
    if (!item) return;
    handleRemove(id);
    setSheetItemId(null);
    showToast(`Removed ${item.name}`);
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

  const handleRename = (id: string, name: string) => {
    pushHistory();
    setShoppingItems(shoppingItems.map((item) => (item.id === id ? { ...item, name } : item)));
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

  const sheetItem = sheetItemId ? shoppingItems.find((i) => i.id === sheetItemId) : undefined;
  const closeSheet = useCallback(() => setSheetItemId(null), []);

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
          <h2 className="text-xl font-bold text-slate-800 shrink-0">Shopping list</h2>
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
          <EmptyListState list={activeList} onGenerate={() => setGenerateOpen(true)} />
          <ManualAddInput value={manualItem} onChange={setManualItem} onAdd={handleAddManual} />
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
        <ManualAddInput value={manualItem} onChange={setManualItem} onAdd={handleAddManual} />
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
              onOpen={() => setSheetItemId(item.id)}
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
                onOpen={() => setSheetItemId(item.id)}
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
      {sheetItem && (
        <ItemSheet
          key={sheetItem.id}
          item={sheetItem}
          onRename={(name) => handleRename(sheetItem.id, name)}
          onCategoryChange={(cat) => handleCategoryChange(sheetItem.id, cat)}
          onMove={(to) => handleMove(sheetItem.id, to)}
          onRemove={() => handleSheetRemove(sheetItem.id)}
          onClose={closeSheet}
        />
      )}
      {toast && (
        <UndoToast key={toast.id} message={toast.message} onUndo={handleUndo} onDismiss={clearToast} />
      )}
    </div>
  );
}
