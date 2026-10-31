import { useRef } from 'react';
import { ChevronDown, GripVertical, MoreHorizontal } from 'lucide-react';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import type { ShoppingCategory, ShoppingItem } from '../../types';
import { CATEGORY_ORDER } from './categoryOrder';

// Edit-mode row: drag to reorder, tap the category chip to change it in place,
// tap the name or the more button to open the item sheet for everything else.
export function EditItem({
  item,
  isDraggable,
  dragIndex,
  isBeingDragged,
  onOpen,
  onCategoryChange,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onGripPointerDown,
  onDragEnterAt,
  onTouchDragEnd,
}: {
  item: ShoppingItem;
  isDraggable: boolean;
  dragIndex?: number;
  isBeingDragged: boolean;
  onOpen: () => void;
  onCategoryChange: (category: ShoppingCategory) => void;
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
    enabled: isDraggable,
    onStart: onGripPointerDown,
    onMoveOver: onDragEnterAt,
    onEnd: onTouchDragEnd,
  });

  return (
    <div
      data-drag-index={dragIndex}
      draggable={isDraggable && !isTouchDragging}
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
        'flex items-center rounded-xl border transition-all duration-150',
        isDraggable ? 'pl-1' : 'pl-3',
        item.checked ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100',
        isBeingDragged ? 'opacity-40 border-dashed border-amber-400 bg-amber-50/40 scale-[0.99]' : '',
      ].join(' ')}
    >
      {isDraggable && (
        <span
          ref={gripRef}
          aria-hidden
          className="shrink-0 self-stretch w-8 flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing"
          onMouseDown={() => { fromGrip.current = true; }}
          onMouseUp={() => { fromGrip.current = false; }}
        >
          <GripVertical size={16} className="text-slate-300 pointer-events-none" />
        </span>
      )}

      <button
        onClick={onOpen}
        aria-label={`Edit ${item.name}`}
        className={[
          'flex-1 min-w-0 min-h-11 text-left truncate text-sm',
          item.checked ? 'line-through text-slate-400' : 'text-slate-700',
        ].join(' ')}
      >
        {item.name}
      </button>

      {/* Quick category change: the native picker sits invisibly over the chip. */}
      <div className="relative shrink-0 min-h-11 flex items-center pl-2">
        <span className="flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 pointer-events-none">
          {item.category}
          <ChevronDown size={10} />
        </span>
        <select
          value={item.category}
          onChange={(e) => onCategoryChange(e.target.value as ShoppingCategory)}
          aria-label={`Category for ${item.name}`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <button
        onClick={onOpen}
        aria-label={`More options for ${item.name}`}
        className="shrink-0 w-11 h-11 flex items-center justify-center text-slate-400 rounded-r-xl active:bg-slate-50"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
