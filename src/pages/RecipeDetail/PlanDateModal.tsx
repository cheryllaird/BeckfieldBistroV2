import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../../types';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { generateId, isoDate, getWeekDays, formatDayLabel } from '../../lib/utils';

interface Props {
  recipe: Recipe;
  servings: number;
  onClose: () => void;
}

export function PlanDateModal({ recipe, servings, onClose }: Props) {
  const navigate = useNavigate();
  const addMealEntry = useStore((s) => s.addMealEntry);
  const mealEntries = useStore((s) => s.mealEntries);

  const thisWeek = getWeekDays(0);
  const nextWeek = getWeekDays(1);
  const allDays = [...thisWeek, ...nextWeek];
  const [selected, setSelected] = useState<string | null>(null);

  const plannedDates = new Set(mealEntries.map((e) => e.date));

  const handleConfirm = () => {
    if (!selected) return;
    addMealEntry({
      id: generateId(),
      date: selected,
      type: 'recipe',
      recipeId: recipe.id,
      servings,
    });
    onClose();
    navigate('/plan');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl flex flex-col max-h-[90dvh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Pick a date</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">Adding: <strong>{recipe.title}</strong></p>

        <div className="grid grid-cols-7 gap-1 mb-5">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-xs font-medium text-slate-400 py-1">
              {d}
            </div>
          ))}
          {allDays.map((day) => {
            const iso = isoDate(day);
            const { monthDay, isToday } = formatDayLabel(day);
            const isPlanned = plannedDates.has(iso);
            const isSelected = selected === iso;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className={[
                  'aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all',
                  isSelected
                    ? 'bg-amber-500 text-white shadow-sm'
                    : isToday
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-300'
                    : isPlanned
                    ? 'bg-slate-100 text-slate-400'
                    : 'hover:bg-slate-50 text-slate-700',
                ].join(' ')}
              >
                {monthDay.split(' ')[0]}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth disabled={!selected} onClick={handleConfirm}>
            <Check size={14} /> Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
