import { useState } from 'react';
import { UtensilsCrossed, MapPin, FileText, Minus, Plus, Trash2, ShoppingCart, CalendarDays, ChevronDown, Check, Users } from 'lucide-react';
import type { MealEntry, MealTime } from '../../types';
import { ModalPortal } from '../../components/ui/ModalPortal';

interface ChipProps {
  entry: MealEntry;
  title: string;
  coverImage?: string;
  onClick: () => void;
  onDelete: () => void;
  onServingsChange: (delta: number) => void;
  onMealTimeChange: (mealTime: MealTime | undefined) => void;
  onAddToShoppingList: () => void;
  onChangeDay: () => void;
  isAddedToList: boolean;
}

export function MealChip({ entry, title, coverImage, onClick, onDelete, onServingsChange, onMealTimeChange, onAddToShoppingList, onChangeDay, isAddedToList }: ChipProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [servingsOpen, setServingsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <>
    {servingsOpen && (
      <ServingsModal
        servings={entry.servings}
        onServingsChange={onServingsChange}
        onClose={() => setServingsOpen(false)}
      />
    )}
    {confirmingDelete && (
      <DeleteConfirmModal
        title={title}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => { setConfirmingDelete(false); onDelete(); }}
      />
    )}
    <div className="flex items-start gap-3 px-3 py-2.5 bg-white border-t border-slate-100 last:rounded-b-2xl last:pb-3">
      {/* Thumbnail */}
      {entry.type === 'recipe' && (
        coverImage && !imgError ? (
          <img
            src={coverImage}
            alt=""
            className="w-10 h-10 rounded-lg object-cover shrink-0"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-300">
            <UtensilsCrossed size={18} />
          </div>
        )
      )}
      {entry.type === 'custom' && (
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 text-blue-300">
          <FileText size={18} />
        </div>
      )}
      {entry.type === 'dining-out' && (
        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 text-amber-400">
          <MapPin size={18} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onClick}
          className="text-sm font-medium text-slate-800 hover:text-slate-900 leading-snug w-full text-left truncate block"
        >
          {title}
        </button>

        {/* Controls row */}
        <div className="flex items-center gap-1.5 mt-1.5">
          {/* Meal time select chip */}
          <div className="relative inline-flex items-center shrink-0">
            <div className="flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-[10px] font-semibold pointer-events-none bg-slate-100 text-slate-500">
              {(entry.mealTime ?? 'dinner').charAt(0).toUpperCase() + (entry.mealTime ?? 'dinner').slice(1)}
              <ChevronDown size={9} />
            </div>
            <select
              value={entry.mealTime ?? 'dinner'}
              onChange={(e) => onMealTimeChange((e.target.value as MealTime) || undefined)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              aria-label="Meal time"
            >
              <option value="">No time set</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="side">Side</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          {/* Servings */}
          <button
            onClick={() => setServingsOpen(true)}
            className="shrink-0 flex items-center gap-1 text-xs text-slate-500 px-2 py-1 rounded-full hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Edit servings"
          >
            <Users size={12} />
            {entry.servings}
          </button>

          <div className="flex-1" />

          {/* Add to shopping list (recipe and custom entries) */}
          {(entry.type === 'recipe' || entry.type === 'custom') && (() => {
            const addLabel =
              entry.type === 'custom' ? 'Add to shopping list' : 'Add ingredients to shopping list';
            return (
              <button
                onClick={onAddToShoppingList}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                  isAddedToList
                    ? 'text-green-500 bg-green-50'
                    : 'text-slate-300 hover:text-blue-400 hover:bg-blue-50'
                }`}
                title={isAddedToList ? 'Added to shopping list' : addLabel}
                aria-label={isAddedToList ? 'Added to shopping list' : addLabel}
              >
                {isAddedToList ? <Check size={14} /> : <ShoppingCart size={14} />}
              </button>
            );
          })()}

          {/* Change day */}
          <button
            onClick={onChangeDay}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
            title="Move to a different day"
            aria-label="Move to a different day"
          >
            <CalendarDays size={14} />
          </button>

          {/* Delete */}
          <button
            onClick={() => setConfirmingDelete(true)}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
            aria-label="Remove meal"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

function ServingsModal({ servings, onServingsChange, onClose }: {
  servings: number;
  onServingsChange: (delta: number) => void;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 shadow-xl w-56 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-slate-700">Servings</p>
        <div className="flex items-center gap-5">
          <button
            onClick={() => onServingsChange(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            aria-label="Reduce servings"
          >
            <Minus size={18} />
          </button>
          <span className="text-3xl font-bold text-slate-800 w-8 text-center">{servings}</span>
          <button
            onClick={() => onServingsChange(1)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            aria-label="Increase servings"
          >
            <Plus size={18} />
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
    </ModalPortal>
  );
}

function DeleteConfirmModal({ title, onCancel, onConfirm }: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 shadow-xl w-72 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-slate-800">Remove meal?</p>
          <p className="text-xs text-slate-500">{title} will be removed from your plan.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
