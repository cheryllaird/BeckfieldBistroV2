import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UtensilsCrossed, MapPin, FileText, Minus, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { formatDayLabel, isoDate } from '../../lib/utils';
import type { MealEntry } from '../../types';
import { PlanMealModal } from './PlanMealModal';

interface Props {
  date: Date;
}

export function DayRow({ date }: Props) {
  const navigate = useNavigate();
  const { mealEntries, recipes, deleteMealEntry, updateMealEntry } = useStore();
  const { weekday, monthDay, isToday } = formatDayLabel(date);
  const iso = isoDate(date);
  const entries = mealEntries.filter((e) => e.date === iso);
  const [modalOpen, setModalOpen] = useState(false);

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

  return (
    <div
      className={[
        'bg-white rounded-2xl border p-3 transition-all',
        isToday ? 'border-amber-200 shadow-sm' : 'border-slate-100',
      ].join(' ')}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={[
              'w-8 h-8 rounded-full flex flex-col items-center justify-center',
              isToday ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600',
            ].join(' ')}
          >
            <span className="text-[9px] font-semibold leading-none uppercase">{weekday}</span>
            <span className="text-[11px] font-bold leading-none">{monthDay.split(' ')[0]}</span>
          </div>
          <span className="text-xs text-slate-400">{monthDay.split(' ')[1]}</span>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-600 transition-colors"
          aria-label="Plan meal"
        >
          <Plus size={14} />
          Plan
        </button>
      </div>

      {/* Meal entries */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          {entries.map((entry) => (
            <MealChip
              key={entry.id}
              entry={entry}
              title={getRecipeTitle(entry)}
              onClick={() => handleEntryClick(entry)}
              onDelete={() => deleteMealEntry(entry.id)}
              onServingsChange={(delta) =>
                updateMealEntry({ ...entry, servings: Math.max(1, entry.servings + delta) })
              }
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <PlanMealModal date={iso} onClose={() => setModalOpen(false)} />
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
}

function MealChip({ entry, title, onClick, onDelete, onServingsChange }: ChipProps) {
  const typeStyles: Record<MealEntry['type'], string> = {
    recipe: 'bg-slate-50 border-slate-200',
    custom: 'bg-blue-50 border-blue-100',
    'dining-out': 'bg-amber-50 border-amber-200',
  };

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${typeStyles[entry.type]}`}>
      {/* Icon */}
      <span className="shrink-0">
        {entry.type === 'recipe' && <UtensilsCrossed size={13} className="text-slate-400" />}
        {entry.type === 'custom' && <FileText size={13} className="text-blue-400" />}
        {entry.type === 'dining-out' && <MapPin size={13} className="text-amber-500" />}
      </span>

      {/* Title */}
      <button
        onClick={onClick}
        className="flex-1 text-left text-xs font-medium text-slate-700 hover:text-slate-900 truncate"
      >
        {title}
        {entry.type === 'dining-out' && entry.location && (
          <span className="text-amber-600 ml-1">· {entry.location}</span>
        )}
      </button>

      {/* Servings control */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onServingsChange(-1)}
          className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600"
          aria-label="Reduce servings"
        >
          <Minus size={10} />
        </button>
        <span className="text-[10px] text-slate-500 w-3 text-center">{entry.servings}</span>
        <button
          onClick={() => onServingsChange(1)}
          className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600"
          aria-label="Increase servings"
        >
          <Plus size={10} />
        </button>
      </div>

      <button
        onClick={onDelete}
        className="shrink-0 text-slate-300 hover:text-red-400 transition-colors"
        aria-label="Remove meal"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
