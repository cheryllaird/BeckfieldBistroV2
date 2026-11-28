import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { useStore } from '../../store';
import { formatDayLabel, isoDate, generateId } from '../../lib/utils';
import { categorize } from '../../lib/ingredients';
import type { MealEntry, MealTime, Recipe, ShoppingItem } from '../../types';
import { PlanMealModal } from './PlanMealModal';
import { ChangeDayModal } from './ChangeDayModal';
import { AddMealPreviewModal } from './AddMealPreviewModal';
import { MealChip } from './MealChip';

interface Props {
  date: Date;
}

const MEAL_TIME_ORDER: Record<MealTime, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  side: 3,
  snack: 4,
};

function ordinal(n: number) {
  if (n >= 11 && n <= 13) return `${n}th`;
  const suffix: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
  return `${n}${suffix[n % 10] ?? 'th'}`;
}

export function DayRow({ date }: Props) {
  const navigate = useNavigate();
  const { mealEntries, recipes, shoppingItems, categoryOverrides, deleteMealEntry, updateMealEntry, setShoppingItems } = useStore();
  const { isToday } = formatDayLabel(date);
  const fullWeekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const dateLabel = `${ordinal(date.getDate())} ${date.toLocaleDateString('en-GB', { month: 'short' })}`;
  const iso = isoDate(date);
  const [modalOpen, setModalOpen] = useState(false);
  const [changeDayEntry, setChangeDayEntry] = useState<MealEntry | null>(null);
  const [preview, setPreview] = useState<{ entry: MealEntry; recipe: Recipe } | null>(null);

  const dayEntries = mealEntries.filter((e) => e.date === iso);
  const sortedEntries = [...dayEntries].sort((a, b) => {
    const aOrder = a.mealTime !== undefined ? MEAL_TIME_ORDER[a.mealTime] : 5;
    const bOrder = b.mealTime !== undefined ? MEAL_TIME_ORDER[b.mealTime] : 5;
    return aOrder - bOrder;
  });

  const getRecipeTitle = (entry: MealEntry) => {
    if (entry.type === 'recipe' && entry.recipeId) {
      return recipes.find((r) => r.id === entry.recipeId)?.title ?? 'Unknown recipe';
    }
    return entry.customTitle ?? '';
  };

  const getRecipeCoverImage = (entry: MealEntry) => {
    if (entry.type === 'recipe' && entry.recipeId) {
      return recipes.find((r) => r.id === entry.recipeId)?.coverImage;
    }
    return undefined;
  };

  const handleEntryClick = (entry: MealEntry) => {
    if (entry.type === 'recipe' && entry.recipeId) {
      navigate(`/recipes/${entry.recipeId}`);
    } else if (entry.type === 'custom') {
      navigate(`/recipes/new?title=${encodeURIComponent(entry.customTitle ?? '')}`);
    }
  };

  const handleAddToShoppingList = (entry: MealEntry) => {
    if (entry.type === 'recipe' && entry.recipeId) {
      const recipe = recipes.find((r) => r.id === entry.recipeId);
      // Recipe meals open a preview, where items can be left off first.
      if (recipe) setPreview({ entry, recipe });
      return;
    }
    if (entry.type === 'custom') {
      const title = (entry.customTitle ?? '').trim();
      if (!title || isInShoppingList(entry.id)) return;
      const newItem: ShoppingItem = {
        id: generateId(),
        name: title,
        category: categorize(title, categoryOverrides),
        checked: false,
        mealSources: [
          { mealEntryId: entry.id, recipeTitle: title, scaledQuantity: 0, unit: '', ingredientName: title },
        ],
      };
      setShoppingItems([...shoppingItems, newItem]);
    }
  };

  const isInShoppingList = (entryId: string) =>
    shoppingItems.some((item) => item.mealSources?.some((src) => src.mealEntryId === entryId));

  return (
    <div
      className={[
        'bg-white rounded-2xl border transition-all',
        isToday ? 'border-amber-200' : 'border-slate-100',
      ].join(' ')}
    >
      {/* Day header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-3">
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
        <div className="flex flex-col gap-px">
          {sortedEntries.map((entry) => (
            <MealChip
              key={entry.id}
              entry={entry}
              title={getRecipeTitle(entry)}
              coverImage={getRecipeCoverImage(entry)}
              onClick={() => handleEntryClick(entry)}
              onDelete={() => deleteMealEntry(entry.id)}
              onServingsChange={(delta) =>
                updateMealEntry({ ...entry, servings: Math.max(1, entry.servings + delta) })
              }
              onMealTimeChange={(mt) => updateMealEntry({ ...entry, mealTime: mt })}
              onAddToShoppingList={() => handleAddToShoppingList(entry)}
              onChangeDay={() => setChangeDayEntry(entry)}
              isAddedToList={isInShoppingList(entry.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <PlanMealModal date={iso} onClose={() => setModalOpen(false)} />
      )}
      {preview && (
        <AddMealPreviewModal entry={preview.entry} recipe={preview.recipe} onClose={() => setPreview(null)} />
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
