import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { useHideOnScroll } from '../../hooks/useHideOnScroll';
import type { LibrarySort } from '../../lib/librarySort';
import { SortControl } from './SortControl';

export type LibraryView = 'all' | 'shared';

interface LibraryToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  showSort: boolean;
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
  recipeCount: number;
  shareCount: number;
}

/**
 * Search, the All / Shared with you tabs and sort, stuck below the header.
 * It slides away while scrolling down and comes back on any scroll up, but
 * never hides while the search box has focus or holds a query.
 */
export function LibraryToolbar(props: LibraryToolbarProps) {
  const { query, onQueryChange, sort, onSortChange, showSort, view, onViewChange, recipeCount, shareCount } = props;
  const [searchFocused, setSearchFocused] = useState(false);
  const hidden = useHideOnScroll(searchFocused || query !== '');

  return (
    <div
      data-testid="library-toolbar"
      data-hidden={hidden}
      inert={hidden}
      className={[
        'sticky top-14 z-30 -mx-4 px-4 pt-2 pb-1 bg-slate-50 flex flex-col gap-3',
        'motion-safe:transition-transform motion-safe:duration-200',
        hidden ? '-translate-y-[calc(100%+1rem)]' : 'translate-y-0',
      ].join(' ')}
    >
      <div className="relative" onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}>
        <Input
          placeholder={recipeCount > 0 ? `Search ${recipeCount} recipes` : 'Search recipes'}
          aria-label="Search recipes by title, ingredient or source"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            if (view !== 'all') onViewChange('all');
          }}
          icon={<Search size={15} />}
        />
        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {shareCount > 0 && (
        <div role="tablist" aria-label="Library" className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'shared'] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={view === tab}
              onClick={() => onViewChange(tab)}
              className={[
                'flex-1 min-h-10 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-all',
                view === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {tab === 'all' ? (
                `All ${recipeCount}`
              ) : (
                <>
                  Shared with you
                  <span className="text-[11px] bg-amber-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                    {shareCount}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {showSort && view === 'all' && <SortControl value={sort} onChange={onSortChange} />}
    </div>
  );
}
