import { Clock, Users, CalendarPlus, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../../types';
import { useStore } from '../../store';
import { generateId, isoDate, getWeekDays } from '../../lib/utils';

interface Props {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: Props) {
  const navigate = useNavigate();
  const { addMealEntry, mealEntries } = useStore();
  const [imgError, setImgError] = useState(false);

  const handleQuickPlan = (e: React.MouseEvent) => {
    e.stopPropagation();
    const weekDays = [...getWeekDays(0), ...getWeekDays(1)];
    const plannedDates = new Set(mealEntries.map((e) => e.date));
    const nextEmpty = weekDays.find((d) => !plannedDates.has(isoDate(d)));
    const targetDate = nextEmpty ? isoDate(nextEmpty) : isoDate(weekDays[0]);

    addMealEntry({
      id: generateId(),
      date: targetDate,
      type: 'recipe',
      recipeId: recipe.id,
      servings: recipe.servings,
    });
    navigate('/plan');
  };

  return (
    <div
      onClick={() => navigate(`/recipes/${recipe.id}`)}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm cursor-pointer hover:shadow-md transition-shadow duration-200 overflow-hidden group"
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

        {/* Quick-plan button */}
        <button
          onClick={handleQuickPlan}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow hover:bg-amber-500 hover:text-white transition-colors"
          aria-label="Add to plan"
        >
          <CalendarPlus size={15} />
        </button>
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
    </div>
  );
}
