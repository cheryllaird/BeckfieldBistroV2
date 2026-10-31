import { useRef, useState } from 'react';
import { ChevronDown, GripVertical, Trash2 } from 'lucide-react';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { isInStock, isOnShoppingList, shoppingItemFromPantry } from '../../lib/ingredients';
import type { PantryItem, ShoppingCategory, ShoppingListType } from '../../types';
import { CATEGORY_ORDER } from './categoryOrder';

export function PantryItemRow({
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
  const { shoppingItems, setShoppingItems, setPantryItemStock } = useStore();
  const [askingWhere, setAskingWhere] = useState(false);
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const inStock = isInStock(item);
  const fromGrip = useRef(false);
  const gripRef = useRef<HTMLSpanElement>(null);

  const { isTouchDragging } = useTouchDrag({
    gripRef,
    enabled: true,
    onStart: onGripPointerDown,
    onMoveOver: onDragEnterAt,
    onEnd: onTouchDragEnd,
  });

  const handleStockToggle = () => {
    setAlreadyOnList(false);
    setPantryItemStock(item.id, !inStock);
    if (inStock) setAskingWhere(true);
  };

  // Stock up / Immediate add nothing when an unticked match is already on a list.
  const handleAddTo = (listType: ShoppingListType) => {
    setAskingWhere(false);
    if (isOnShoppingList(item, shoppingItems)) {
      setAlreadyOnList(true);
      return;
    }
    setShoppingItems([shoppingItemFromPantry(item, listType), ...shoppingItems]);
  };

  return (
    <div>
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
        inStock ? '' : 'bg-slate-50',
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

      <span
        className={[
          'text-sm capitalize flex-1 min-w-0 truncate',
          inStock ? 'text-slate-700' : 'text-slate-400 line-through',
        ].join(' ')}
      >
        {item.name}
      </span>

      <button
        role="switch"
        aria-checked={inStock}
        aria-label={`${item.name} in stock`}
        onClick={handleStockToggle}
        className={[
          'relative w-9 h-5 rounded-full transition-colors shrink-0',
          inStock ? 'bg-amber-500' : 'bg-slate-300',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
            inStock ? 'translate-x-4' : '',
          ].join(' ')}
        />
      </button>

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
      {!inStock && !askingWhere && alreadyOnList && (
        <p role="status" className="px-3 pt-1 text-xs text-slate-400">
          Already on your list
        </p>
      )}
      {askingWhere && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"
            onClick={() => setAskingWhere(false)}
          >
            <div
              role="dialog"
              aria-label={`${item.name} is out of stock`}
              className="w-full max-w-md rounded-2xl bg-white p-4 flex flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-slate-800 capitalize">
                {item.name} is out of stock
              </p>
              <Button onClick={() => handleAddTo('stock-up')}>Add to Stock up</Button>
              <Button onClick={() => handleAddTo('immediate')}>Add to Immediate</Button>
              <Button variant="secondary" onClick={() => setAskingWhere(false)}>Skip</Button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
