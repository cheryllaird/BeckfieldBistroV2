import { ArrowUpDown } from 'lucide-react';
import type { LibrarySort } from '../../lib/librarySort';

const OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'most-planned', label: 'Most planned' },
];

interface SortControlProps {
  value: LibrarySort;
  onChange: (value: LibrarySort) => void;
}

/** A quiet, text-only sort switch that sits right-aligned above the grid. */
export function SortControl({ value, onChange }: SortControlProps) {
  return (
    <div
      className="-my-3 flex items-center justify-end gap-1 text-xs text-slate-400"
      role="group"
      aria-label="Sort recipes"
    >
      <ArrowUpDown size={12} aria-hidden="true" />
      {OPTIONS.map((option, i) => (
        <span key={option.value} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">·</span>}
          <button
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={[
              'min-h-11 px-1 transition-colors',
              value === option.value ? 'font-semibold text-amber-700' : 'text-slate-400',
            ].join(' ')}
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  );
}
