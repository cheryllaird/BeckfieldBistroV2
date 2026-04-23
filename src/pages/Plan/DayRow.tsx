import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UtensilsCrossed, MapPin, FileText, Minus, Trash2, ShoppingCart, CalendarDays, CalendarPlus, ChevronDown, Check } from 'lucide-react';
import { useStore } from '../../store';
import { formatDayLabel, isoDate, generateId } from '../../lib/utils';
import type { MealEntry, MealTime } from '../../types';
import { PlanMealModal } from './PlanMealModal';
import { ChangeDayModal } from './ChangeDayModal';
import { ModalPortal } from '../../components/ui/ModalPortal';

interface Props {
  date: Date;
}

const MEAL_TIME_ORDER: Record<MealTime, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};


function ordinal(n: number) {
  if (n >= 11 && n <= 13) return `${n}th`;
  const suffix: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${n}${suffix[n % 10] ?? 'th'}`;
}

export function DayRow({ date }: Props) {
  const navigate = useNavigate();
  const { mealEntries, recipes, deleteMealEntry, updateMealEntry, addShoppingItem } = useStore();
  const { isToday } = formatDayLabel(date);
  const fullWeekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const dateLabel = `${ordinal(date.getDate())} ${date.toLocaleDateString('en-GB', { month: 'short' })}`;
  const iso = isoDate(date);
  const [modalOpen, setModalOpen] = useState(false);
  const [changeDayEntry, setChangeDayEntry] = useState<MealEntry | null>(null);

  const dayEntries = mealEntries.filter((e) => e.date === iso);
  const sortedEntries = [...dayEntries].sort((a, b) => {
    const aOrder = a.mealTime !== undefined ? MEAL_TIME_ORDER[a.mealTime] : 4;
    const bOrder = b.mealTime !== undefined ? MEAL_TIME_ORDER[b.mealTime] : 4;
    return aOrder - bOrder;
  });

  const getRecipeTitle = (entry: MealEntry) => {
    if (entry.type === 'recipe' && entry.recipeId) {
      return recipes.find((r) => r.id === entry.recipeId)?.title ?? 'Unknown Recipe';
    }
    return entry.customTitle ?? '';
  };

  const handleEntryClick = (entry: MealEntry) => {
    if (entry.type === 'recipe' && entry.recipeId) {
      navigate(`/recipes/${entry.recipeId}`);
    } else if (entry.type === 'custom') {
      navigate(`/recipes/new?title=${encodeURIComponent(entry.customTitle ?? '')}`);
    }
  };

  const handleAddToShoppingList = (entry: MealEntry) => {
    if (entry.type !== 'recipe' || !entry.recipeId) return;
    const recipe = recipes.find((r) => r.id === entry.recipeId);
    if (!recipe) return;
    const scale = recipe.servings > 0 ? entry.servings / recipe.servings : 1;
    recipe.ingredients.forEach((ing) => {
      addShoppingItem({
        id: generateId(),
        name: ing.name,
        quantity: Math.round(ing.quantity * scale * 100) / 100,
        unit: ing.unit,
        category: 'Other',
        checked: false,
      });
    });
  };

  return (
    <div
      className={[
        'bg-white rounded-2xl border p-3 transition-all',
        isToday ? 'border-amber-200 shadow-sm' : 'border-slate-100',
      ].join(' ')}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm leading-none">
          <span className={`font-bold ${isToday ? 'text-amber-500' : 'text-slate-800'}`}>{fullWeekday}</span>
          <span className="text-slate-400 font-normal"> {dateLabel}</span>
        </p>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 transition-colors py-1.5 px-2 -mr-2 rounded-lg"
          aria-label="Plan meal"
        >
          <CalendarPlus size={15} />
          Plan
        </button>
      </div>

      {/* Meal entries */}
      {sortedEntries.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          {sortedEntries.map((entry) => (
            <MealChip
              key={entry.id}
              entry={entry}
              title={getRecipeTitle(entry)}
              onClick={() => handleEntryClick(entry)}
              onDelete={() => deleteMealEntry(entry.id)}
              onServingsChange={(delta) =>
                updateMealEntry({ ...entry, servings: Math.max(1, entry.servings + delta) })
              }
              onMealTimeChange={(mt) => updateMealEntry({ ...entry, mealTime: mt })}
              onAddToShoppingList={() => handleAddToShoppingList(entry)}
              onChangeDay={() => setChangeDayEntry(entry)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <PlanMealModal date={iso} onClose={() => setModalOpen(false)} />
      )}
      {changeDayEntry && (
        <ChangeDayModal
          entry={changeDayEntry}
          title={getRecipeTitle(changeDayEntry)}
          onClose={() => setChangeDayEntry(null)}
        />
      )}
    </div>
  );
}

interface ChipProps {
  entry: MealEntry;
  title: string;
  onClick: () => void;
  onDelete: () => void;
  onServingsChange: (delta: number) => void;
  onMealTimeChange: (mealTime: MealTime | undefined) => void;
  onAddToShoppingList: () => void;
  onChangeDay: () => void;
}

function MealChip({ entry, title, onClick, onDelete, onServingsChange, onMealTimeChange, onAddToShoppingList, onChangeDay }: ChipProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const [servingsOpen, setServingsOpen] = useState(false);

  const typeStyles: Record<MealEntry['type'], string> = {
    recipe: 'bg-slate-50 border-slate-200',
    custom: 'bg-blue-50 border-blue-100',
    'dining-out': 'bg-amber-50 border-amber-200',
  };

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
    <div className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${typeStyles[entry.type]}`}>
      {/* Row 1: Icon + Title */}
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-0.5">
          {entry.type === 'recipe' && <UtensilsCrossed size={13} className="text-slate-400" />}
          {entry.type === 'custom' && <FileText size={13} className="text-blue-400" />}
          {entry.type === 'dining-out' && <MapPin size={13} className="text-amber-500" />}
        </span>
        <button
          onClick={onClick}
          className="flex-1 text-left text-xs font-medium text-slate-700 hover:text-slate-900 leading-snug"
        >
          {title}
          {entry.type === 'dining-out' && entry.location && (
            <span className="text-amber-600 ml-1">· {entry.location}</span>
          )}
        </button>
      </div>

      {/* Row 2: Meal time chip + Actions */}
      <div className="flex items-center gap-1.5">
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
            <option value="snack">Snack</option>
          </select>
        </div>

        {/* Servings label — opens modal on click */}
        <button
          onClick={() => setServingsOpen(true)}
          className="shrink-0 text-[10px] text-slate-500 font-medium whitespace-nowrap px-2 py-1 rounded-full hover:bg-white/70 hover:text-slate-700 transition-colors"
          aria-label="Edit servings"
        >
          {entry.servings} servings
        </button>

        <div className="flex-1" />

        {/* Add to shopping list (recipe only) */}
        {entry.type === 'recipe' && (
          <button
            onClick={() => { onAddToShoppingList(); setAddedToList(true); }}
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              addedToList
                ? 'text-green-500 bg-green-50'
                : 'text-slate-300 hover:text-blue-400 hover:bg-blue-50'
            }`}
            title={addedToList ? 'Added to shopping list' : 'Add ingredients to shopping list'}
            aria-label={addedToList ? 'Added to shopping list' : 'Add ingredients to shopping list'}
          >
            {addedToList ? <Check size={15} /> : <ShoppingCart size={15} />}
          </button>
        )}

        {/* Change day */}
        <button
          onClick={onChangeDay}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
          title="Move to a different day"
          aria-label="Move to a different day"
        >
          <CalendarDays size={15} />
        </button>

        {/* Delete */}
        <button
          onClick={() => setConfirmingDelete(true)}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
          aria-label="Remove meal"
        >
          <Trash2 size={15} />
        </button>
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
