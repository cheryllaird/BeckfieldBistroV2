import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useStore } from '../../store';
import { RecipeCard } from './RecipeCard';
import { BulkShareModal } from './BulkShareModal';
import { BulkSelectBar } from './BulkSelectBar';
import { TipThankYouCard } from './TipThankYouCard';
import { Button } from '../../components/ui/Button';
import { useLibraryRecipes } from './useLibraryRecipes';
import { LibraryToolbar, type LibraryView } from './LibraryToolbar';
import { SharedInbox } from './SharedInbox';
import { AddRecipePill } from './AddRecipePill';

export function LibraryPage() {
  const navigate = useNavigate();
  const recipes = useStore((s) => s.recipes);
  const shareCount = useStore((s) => s.incomingShares.length);
  const [query, setQuery] = useState('');
  const { filtered, sort, setSort } = useLibraryRecipes(query);

  const [view, setView] = useState<LibraryView>('all');
  // Saving or dismissing the last share (or it expiring) returns the page to All.
  if (shareCount === 0 && view !== 'all') setView('all');

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
  const showPill = !selectMode && !bulkShareOpen;

  return (
    // pb-8 on top of <main>'s pb-28 lets the last row scroll clear of the Add recipe pill.
    <div className="flex flex-col gap-5 pb-8">
      <h2 className="sr-only">My recipes</h2>

      <TipThankYouCard />

      <LibraryToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        showSort={recipes.length > 0}
        view={view}
        onViewChange={setView}
        recipeCount={recipes.length}
        shareCount={shareCount}
      />

      {view === 'shared' ? (
        <SharedInbox />
      ) : (
        <>
          {query && (
            <p className="text-xs text-slate-400">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{query}"
            </p>
          )}

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
          ) : (
            <div className="flex flex-col items-center gap-4 py-16 text-center animate-fade">
              <div>
                <p className="text-base font-semibold text-slate-700">
                  {query ? 'No recipes found' : 'Your library is empty'}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {query ? 'Try a different search term' : 'Add your first recipe to get started'}
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
        </>
      )}

      {showPill && <AddRecipePill onClick={() => navigate('/recipes/new')} />}

      {selectMode && (
        <BulkSelectBar
          count={selectedIds.size}
          onCancel={cancelSelect}
          onShare={() => setBulkShareOpen(true)}
        />
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
