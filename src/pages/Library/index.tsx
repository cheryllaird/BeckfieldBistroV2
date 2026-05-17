import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, X, Share2 } from 'lucide-react';
import { useStore } from '../../store';
import { RecipeCard } from './RecipeCard';
import { IncomingShareCard } from './IncomingShareCard';
import { BulkShareModal } from './BulkShareModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ModalPortal } from '../../components/ui/ModalPortal';

export function LibraryPage() {
  const navigate = useNavigate();
  const recipes = useStore((s) => s.recipes);
  const recipesLoading = useStore((s) => s.recipesLoading);
  const incomingShares = useStore((s) => s.incomingShares);
  const [query, setQuery] = useState('');

  const acceptAllShares = useStore((s) => s.acceptAllShares);
  const dismissAllShares = useStore((s) => s.dismissAllShares);
  const [showAllShares, setShowAllShares] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [dismissingAll, setDismissingAll] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkShareOpen, setBulkShareOpen] = useState(false);

  // Refs let the popstate handler read current values without stale closures
  const selectModeRef = useRef(false);
  const cancellingHistoryRef = useRef(false);

  // Intercept browser back while in select mode
  useEffect(() => {
    const onPopstate = () => {
      if (cancellingHistoryRef.current) {
        // Triggered by our own history.back() in cancelSelect — ignore
        cancellingHistoryRef.current = false;
        return;
      }
      if (selectModeRef.current) {
        // User pressed the browser back button — cancel selection instead of navigating
        selectModeRef.current = false;
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('popstate', onPopstate);
    return () => window.removeEventListener('popstate', onPopstate);
  }, []);

  const filtered = useMemo(() => {
    const list = query.trim()
      ? recipes.filter(
          (r) =>
            r.title.toLowerCase().includes(query.toLowerCase()) ||
            r.source.toLowerCase().includes(query.toLowerCase()) ||
            r.ingredients.some((i) => i.name.toLowerCase().includes(query.toLowerCase()))
        )
      : [...recipes];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [recipes, query]);

  const handleLongPress = (recipeId: string) => {
    // Push a dummy history entry so the back button can be intercepted
    window.history.pushState({ bulkSelect: true }, '');
    selectModeRef.current = true;
    setSelectMode(true);
    setSelectedIds(new Set([recipeId]));
  };

  const handleSelect = (recipeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  };

  const cancelSelect = () => {
    selectModeRef.current = false;
    setSelectMode(false);
    setSelectedIds(new Set());
    // Remove the dummy history entry pushed on long-press
    cancellingHistoryRef.current = true;
    window.history.back();
  };

  const selectedRecipes = recipes.filter((r) => selectedIds.has(r.id));

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
            <div className="flex gap-2 ml-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  setDismissingAll(true);
                  try { await dismissAllShares(); } finally { setDismissingAll(false); }
                }}
                disabled={savingAll || dismissingAll}
              >
                {dismissingAll ? 'Dismissing…' : 'Dismiss All'}
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  setSavingAll(true);
                  try { await acceptAllShares(); } finally { setSavingAll(false); }
                }}
                disabled={savingAll || dismissingAll}
              >
                {savingAll ? 'Saving…' : 'Save All'}
              </Button>
            </div>
          </div>
          {(showAllShares ? incomingShares : incomingShares.slice(0, 3)).map((share) => (
            <IncomingShareCard key={share.id} share={share} />
          ))}
          {!showAllShares && incomingShares.length > 3 && (
            <button
              onClick={() => setShowAllShares(true)}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium text-left pl-1"
            >
              and {incomingShares.length - 3} more…
            </button>
          )}
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
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isSelectMode={selectMode}
              isSelected={selectedIds.has(recipe.id)}
              onLongPress={() => handleLongPress(recipe.id)}
              onSelect={() => handleSelect(recipe.id)}
            />
          ))}
        </div>
      ) : recipesLoading && !query ? (
        <div className="flex flex-col items-center gap-3 py-16 animate-fade">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-amber-400"
                style={{ animation: `fadeOnly 0.8s ease-in-out ${i * 0.2}s infinite alternate` }}
              />
            ))}
          </div>
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

      {/* Bulk select action bar — portalled to body to escape main's transform stacking context */}
      {selectMode && (
        <ModalPortal>
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg px-4 py-3">
            <div className="max-w-md mx-auto flex items-center gap-3">
              <button
                onClick={cancelSelect}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Cancel selection"
              >
                <X size={20} />
              </button>
              <span className="flex-1 text-sm font-semibold text-slate-700">
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                onClick={() => setBulkShareOpen(true)}
                disabled={selectedIds.size === 0}
              >
                <Share2 size={14} />
                Share {selectedIds.size > 0 ? selectedIds.size : ''}
              </Button>
            </div>
          </div>
        </ModalPortal>
      )}

      {bulkShareOpen && (
        <BulkShareModal
          recipes={selectedRecipes}
          onClose={() => setBulkShareOpen(false)}
          onDone={() => {
            setBulkShareOpen(false);
            cancelSelect();
          }}
        />
      )}
    </div>
  );
}
