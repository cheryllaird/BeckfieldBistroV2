import { useRef } from 'react';
import { ArrowRightLeft, ChevronDown, GripVertical, X } from 'lucide-react';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import type { ShoppingCategory, ShoppingItem } from '../../types';
import { CATEGORY_ORDER } from './categoryOrder';

export function EditItem({
  item,
  isDraggable,
  dragIndex,
  isBeingDragged,
  isEditing,
  editingValue,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onRemove,
  onMove,
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
  isEditing: boolean;
  editingValue: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRemove: () => void;
  onMove: () => void;
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
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150',
        item.checked ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100',
        isBeingDragged ? 'opacity-40 border-dashed border-amber-400 bg-amber-50/40 scale-[0.99]' : '',
      ].join(' ')}
    >
      {isDraggable && (
        <span
          ref={gripRef}
          className="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing"
          onMouseDown={() => { fromGrip.current = true; }}
          onMouseUp={() => { fromGrip.current = false; }}
        >
          <GripVertical size={16} className="text-slate-300 pointer-events-none" />
        </span>
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

      <div className="relative inline-flex items-center shrink-0">
        <div className="flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-[10px] font-semibold pointer-events-none bg-slate-100 text-slate-500">
          {item.category}
          <ChevronDown size={9} />
        </div>
        <select
          value={item.category}
          onChange={(e) => onCategoryChange(e.target.value as ShoppingCategory)}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label="Item category"
        >
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <button
        onClick={onMove}
        className="text-slate-300 hover:text-amber-600 transition-colors shrink-0"
        aria-label={item.listType === 'stock-up' ? 'Move to Immediate' : 'Move to Stock up'}
      >
        <ArrowRightLeft size={15} />
      </button>

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
