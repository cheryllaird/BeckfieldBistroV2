import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, X } from 'lucide-react';
import { useStore } from '../../store';
import { RecipeCard } from './RecipeCard';
import { IncomingShareCard } from './IncomingShareCard';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export function LibraryPage() {
  const navigate = useNavigate();
  const recipes = useStore((s) => s.recipes);
  const incomingShares = useStore((s) => s.incomingShares);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return recipes;
    const q = query.toLowerCase();
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [recipes, query]);

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">My Recipes</h2>
        <Button size="sm" onClick={() => navigate('/recipes/new')}>
          <Plus size={14} />
          Add Recipe
        </Button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Input
          placeholder="Search by title, ingredient, or source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          icon={<Search size={15} />}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Incoming shares inbox */}
      {incomingShares.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Shared with You</h3>
            <span className="text-xs font-semibold bg-amber-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {incomingShares.length}
            </span>
          </div>
          {incomingShares.map((share) => (
            <IncomingShareCard key={share.id} share={share} />
          ))}
        </div>
      )}

      {/* Recipe count */}
      {query && (
        <p className="text-xs text-slate-400">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{query}"
        </p>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 animate-in">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-16 text-center animate-fade">
          <span className="text-5xl">🍳</span>
          <div>
            <p className="text-base font-semibold text-slate-700">
              {query ? 'No recipes found' : 'Your library is empty'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {query
                ? 'Try a different search term'
                : 'Add your first recipe to get started'}
            </p>
          </div>
          {!query && (
            <Button onClick={() => navigate('/recipes/new')}>
              <Plus size={15} />
              Add your first recipe
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
