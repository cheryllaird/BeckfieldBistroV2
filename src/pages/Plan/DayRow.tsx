import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UtensilsCrossed, MapPin, FileText, Minus, Trash2, ShoppingCart, CalendarDays, CalendarPlus, ChevronDown } from 'lucide-react';
import { useStore } from '../../store';
import { formatDayLabel, isoDate, generateId } from '../../lib/utils';
import type { MealEntry, MealTime } from '../../types';
import { PlanMealModal } from './PlanMealModal';
import { ChangeDayModal } from './ChangeDayModal';

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

  const typeStyles: Record<MealEntry['type'], string> = {
    recipe: 'bg-slate-50 border-slate-200',
    custom: 'bg-blue-50 border-blue-100',
    'dining-out': 'bg-amber-50 border-amber-200',
  };

  return (
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

        <div className="flex-1" />

        {/* Servings control */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onServingsChange(-1)}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-white/70"
            aria-label="Reduce servings"
          >
            <Minus size={12} />
          </button>
          <span className="text-[11px] text-slate-600 font-medium w-4 text-center">{entry.servings}</span>
          <button
            onClick={() => onServingsChange(1)}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-white/70"
            aria-label="Increase servings"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Add to shopping list (recipe only) */}
        {entry.type === 'recipe' && (
          <button
            onClick={onAddToShoppingList}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:text-blue-400 hover:bg-blue-50 transition-colors"
            title="Add ingredients to shopping list"
            aria-label="Add ingredients to shopping list"
          >
            <ShoppingCart size={15} />
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
        {confirmingDelete ? (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-red-500 font-medium">Delete?</span>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmingDelete(false); onDelete(); }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
            aria-label="Remove meal"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
