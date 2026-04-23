import { useState } from 'react';
import { X, Search, UtensilsCrossed, MapPin } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { generateId } from '../../lib/utils';
import type { Recipe } from '../../types';

function RecipeListItem({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-left w-full"
    >
      {recipe.coverImage && !imgError ? (
        <img
          src={recipe.coverImage}
          alt=""
          className="w-10 h-10 rounded-lg object-cover shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-300">
          <UtensilsCrossed size={18} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{recipe.title}</p>
        <p className="text-xs text-slate-400">{recipe.source}</p>
      </div>
    </button>
  );
}

interface Props {
  date: string;
  onClose: () => void;
}

export function PlanMealModal({ date, onClose }: Props) {
  const { recipes, addMealEntry } = useStore();
  const [tab, setTab] = useState<'recipe' | 'dining-out'>('recipe');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');

  const filtered = recipes.filter((r) =>
    r.title.toLowerCase().includes(query.toLowerCase()) ||
    r.source.toLowerCase().includes(query.toLowerCase())
  );

  const addRecipeMeal = (recipeId: string, servings: number) => {
    addMealEntry({ id: generateId(), date, type: 'recipe', recipeId, servings });
    onClose();
  };

  const addCustomMeal = (title: string) => {
    addMealEntry({ id: generateId(), date, type: 'custom', customTitle: title.trim(), servings: 1 });
    onClose();
  };

  const addDiningOut = () => {
    addMealEntry({
      id: generateId(),
      date,
      type: 'dining-out',
      customTitle: location.trim() || 'Dining Out',
      location: location.trim(),
      servings: 1,
    });
    onClose();
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col h-[90dvh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <h3 className="text-base font-semibold text-slate-800">Plan a Meal</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          {[
            { key: 'recipe', label: 'From Library', icon: UtensilsCrossed },
            { key: 'dining-out', label: 'Dining Out', icon: MapPin },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={[
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors',
                tab === key
                  ? 'text-amber-600 border-b-2 border-amber-500'
                  : 'text-slate-400 hover:text-slate-600',
              ].join(' ')}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4">
          {tab === 'recipe' && (
            <div className="flex flex-col gap-3">
              <Input
                placeholder="Search recipes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                icon={<Search size={14} />}
              />
              {filtered.length === 0 && query.trim() && (
                <button
                  onClick={() => addCustomMeal(query)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-slate-200 hover:bg-slate-50 transition-colors text-left w-full"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                    <UtensilsCrossed size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">"{query}"</p>
                    <p className="text-xs text-slate-400">Add as custom meal</p>
                  </div>
                </button>
              )}
              {filtered.length === 0 && !query.trim() && (
                <p className="text-xs text-slate-400 text-center py-4">No recipes in library</p>
              )}
              {filtered.map((r) => (
                <RecipeListItem
                  key={r.id}
                  recipe={r}
                  onClick={() => addRecipeMeal(r.id, r.servings)}
                />
              ))}
            </div>
          )}

          {tab === 'dining-out' && (
            <div className="flex flex-col gap-3">
              <Input
                label="Restaurant / location (optional)"
                placeholder="e.g. The Italian Place"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                icon={<MapPin size={14} />}
              />
              <Button fullWidth onClick={addDiningOut}>
                <MapPin size={14} /> Mark as Dining Out
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
