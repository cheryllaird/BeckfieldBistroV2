import { Clock, Users, CalendarPlus, UtensilsCrossed, Check } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../../types';
import { useStore } from '../../store';
import { isoDate, getWeekDays } from '../../lib/utils';
import { PlanDateModal } from '../RecipeDetail/PlanDateModal';
import { useLongPress } from '../../hooks/useLongPress';

interface Props {
  recipe: Recipe;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onLongPress?: () => void;
  onSelect?: () => void;
}

export function RecipeCard({ recipe, isSelectMode, isSelected, onLongPress, onSelect }: Props) {
  const navigate = useNavigate();
  const { mealEntries } = useStore();

  const [imgError, setImgError] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  const { handlers: longPressHandlers, didFire } = useLongPress(() => onLongPress?.());

  const handleQuickPlan = (e: React.MouseEvent) => {
    e.stopPropagation();
    const weekDays = [...getWeekDays(0), ...getWeekDays(1)];
    const plannedDates = new Set(mealEntries.map((e) => e.date));
    const nextEmpty = weekDays.find((d) => !plannedDates.has(isoDate(d)));
    const targetDate = nextEmpty ? isoDate(nextEmpty) : isoDate(weekDays[0]);
    setDefaultDate(targetDate);
    setPlanModalOpen(true);
  };

  const handleClick = () => {
    if (didFire()) return;
    if (isSelectMode) {
      onSelect?.();
      return;
    }
    navigate(`/recipes/${recipe.id}`);
  };

  return (
    <div
      onClick={handleClick}
      {...longPressHandlers}
      className={[
        'bg-white rounded-2xl border shadow-sm cursor-pointer transition-all duration-200 overflow-hidden group relative select-none',
        isSelected
          ? 'border-amber-400 ring-2 ring-amber-400 shadow-amber-100'
          : 'border-slate-100 hover:shadow-md',
      ].join(' ')}
    >
      {/* Cover image */}
      <div className="relative aspect-[4/3] bg-slate-100">
        {recipe.coverImage && !imgError ? (
          <img
            src={recipe.coverImage}
            alt={recipe.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <UtensilsCrossed size={40} />
          </div>
        )}

        {/* Selection indicator */}
        {isSelectMode && (
          <div
            className={[
              'absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors',
              isSelected ? 'bg-amber-500 border-amber-500' : 'bg-white/90 border-slate-300',
            ].join(' ')}
          >
            {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
          </div>
        )}

        {/* Quick-plan button — hidden in select mode */}
        {!isSelectMode && (
          <button
            onClick={handleQuickPlan}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow hover:bg-amber-500 hover:text-white transition-colors"
            aria-label="Add to plan"
          >
            <CalendarPlus size={15} />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">
          {recipe.title}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">{recipe.source}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Users size={12} />
            {recipe.servings}
          </span>
          {recipe.totalTime && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Clock size={12} />
              {recipe.totalTime}
            </span>
          )}
        </div>
      </div>

      {planModalOpen && (
        <PlanDateModal
          recipe={recipe}
          servings={recipe.servings}
          initialDate={defaultDate}
          onClose={() => setPlanModalOpen(false)}
          onConfirm={() => setPlanModalOpen(false)}
        />
      )}
    </div>
  );
}
