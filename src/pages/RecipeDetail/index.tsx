import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Users,
  Minus,
  Plus,
  CalendarPlus,
  Trash2,
  Edit,
  MoreVertical,
  ExternalLink,
  Image,
  UtensilsCrossed,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { scaleIngredient, formatQuantity } from '../../lib/utils';
import { PlanDateModal } from './PlanDateModal';

type Tab = 'ingredients' | 'method';

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipes, deleteRecipe } = useStore();

  const recipe = recipes.find((r) => r.id === id);
  const [tab, setTab] = useState<Tab>('ingredients');
  const [servings, setServings] = useState(recipe?.servings ?? 2);
  const [imgError, setImgError] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  if (!recipe) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-slate-500">Recipe not found.</p>
        <Button variant="ghost" onClick={() => navigate('/recipes')}>
          <ArrowLeft size={15} /> Back to Library
        </Button>
      </div>
    );
  }

  const scaledIngredients = recipe.ingredients.map((ing) =>
    scaleIngredient(ing, recipe.servings, servings)
  );

  const handleDelete = () => {
    setMenuOpen(false);
    if (confirm(`Delete "${recipe.title}"? This cannot be undone.`)) {
      deleteRecipe(recipe.id);
      navigate('/recipes');
    }
  };

  return (
    <div className="flex flex-col gap-0 animate-in">
      {/* Cover image */}
      <div className="relative -mx-4 -mt-4 aspect-[16/9] bg-slate-100 mb-4">
        {recipe.coverImage && !imgError ? (
          <img
            src={recipe.coverImage}
            alt={recipe.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <UtensilsCrossed size={64} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent" />

        {/* Kebab menu — top right overlay */}
        <div className="absolute top-3 right-3" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
            aria-label="More options"
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[180px] z-50">
              <button
                onClick={() => { navigate(`/recipes/${recipe.id}/edit`); setMenuOpen(false); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit size={14} /> Edit recipe
              </button>

              {recipe.originalImage && !recipe.originalImage.startsWith('data:') && (
                <a
                  href={recipe.originalImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Image size={14} /> View original image
                </a>
              )}

              {recipe.sourceUrl && (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <ExternalLink size={14} /> View original recipe
                </a>
              )}

              <div className="my-1 border-t border-slate-100" />

              <button
                onClick={handleDelete}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} /> Delete recipe
              </button>
            </div>
          )}
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className="text-xl font-bold text-white leading-tight">{recipe.title}</h1>
          <p className="text-sm text-white/70 mt-0.5">{recipe.source}</p>
        </div>
      </div>

      {/* Meta badges */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Badge variant="default">
          <Users size={11} /> {recipe.servings} servings (original)
        </Badge>
        {recipe.prepTime && (
          <Badge variant="amber">
            <Clock size={11} /> Prep: {recipe.prepTime}
          </Badge>
        )}
        {recipe.totalTime && (
          <Badge variant="amber">
            <Clock size={11} /> {recipe.totalTime}
          </Badge>
        )}
      </div>

      {/* Action row */}
      <div className="flex gap-2 mb-5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setPlanModalOpen(true)}
          className="flex-1"
        >
          <CalendarPlus size={14} /> Plan this meal
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
        {(['ingredients', 'method'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-150 capitalize',
              tab === t
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'ingredients' && (
        <div className="animate-in">
          {/* Serving adjuster */}
          <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
            <span className="text-sm font-medium text-slate-700">Adjust servings</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-sm"
                aria-label="Decrease servings"
              >
                <Minus size={13} />
              </button>
              <span className="text-base font-bold text-amber-700 w-6 text-center">
                {servings}
              </span>
              <button
                onClick={() => setServings((s) => s + 1)}
                className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 shadow-sm"
                aria-label="Increase servings"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Ingredient list */}
          <ul className="flex flex-col divide-y divide-slate-100">
            {scaledIngredients.map((ing, index) => (
              <li key={index} className="flex items-baseline justify-between py-2.5">
                <span className="text-sm text-slate-700">{ing.name}</span>
                <span className="text-sm font-medium text-slate-900 ml-4 shrink-0">
                  {ing.quantity > 0 ? formatQuantity(ing.quantity) : ''}{' '}
                  {ing.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'method' && (
        <ol className="flex flex-col gap-4 animate-in">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      )}

      {/* Back button */}
      <div className="mt-8">
        <Button variant="ghost" fullWidth onClick={() => navigate('/recipes')}>
          <ArrowLeft size={15} /> Back to Library
        </Button>
      </div>

      {planModalOpen && (
        <PlanDateModal
          recipe={recipe}
          servings={servings}
          onClose={() => setPlanModalOpen(false)}
        />
      )}
    </div>
  );
}
