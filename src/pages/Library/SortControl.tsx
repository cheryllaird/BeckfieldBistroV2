import { ArrowUpDown, ChevronDown } from 'lucide-react';
import type { LibrarySort } from '../../lib/librarySort';

const OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'most-planned', label: 'Most planned' },
];

interface SortControlProps {
  value: LibrarySort;
  onChange: (value: LibrarySort) => void;
}

/**
 * A compact pill that sits beside the search box and shows the current order.
 * A transparent native <select> covers it, so a tap opens the phone's own picker.
 * The select is 16px so iOS doesn't zoom in when it gets focus.
 */
export function SortControl({ value, onChange }: SortControlProps) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  return (
    <div className="relative shrink-0 flex items-center gap-1 h-full min-h-11 pl-3 pr-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 has-[:focus-visible]:border-amber-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber-soft">
      <ArrowUpDown size={13} className="text-slate-400" aria-hidden />
      <span aria-hidden className="whitespace-nowrap">{current.label}</span>
      <ChevronDown size={13} className="text-slate-400" aria-hidden />
      <select
        aria-label="Sort recipes"
        value={value}
        onChange={(e) => onChange(e.target.value as LibrarySort)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
