import type { LibrarySort } from '../../lib/librarySort';

const OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'most-planned', label: 'Most planned' },
];

interface SortControlProps {
  value: LibrarySort;
  onChange: (value: LibrarySort) => void;
}

export function SortControl({ value, onChange }: SortControlProps) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Sort recipes">
      <span className="text-xs font-medium text-slate-500">Sort</span>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={[
            'min-h-11 px-3.5 rounded-full text-sm border transition-colors',
            value === option.value
              ? 'bg-amber-soft border-amber-400 text-amber-700 font-semibold'
              : 'bg-white border-slate-200 text-slate-600',
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
