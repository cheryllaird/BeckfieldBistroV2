import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../../store';
import { isoDate } from '../../lib/utils';
import { useSwipeNavigate } from '../../hooks/useSwipeNavigate';

interface HistoryViewProps {
  year: number;
  month: number;
  setYear: React.Dispatch<React.SetStateAction<number>>;
  setMonth: React.Dispatch<React.SetStateAction<number>>;
}

export function HistoryView({ year, month, setYear, setMonth }: HistoryViewProps) {
  const mealEntries = useStore((s) => s.mealEntries);
  const recipes = useStore((s) => s.recipes);

  const today = new Date();
  const gridRef = useRef<HTMLDivElement>(null);

  const applyMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setMonth(newMonth);
    setYear(newYear);
  };

  // Months run forever in both directions, so there is no edge to resist at.
  const swipe = useSwipeNavigate({
    contentRef: gridRef,
    onNext: () => applyMonth(1),
    onPrev: () => applyMonth(-1),
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = lastDay.getDate();

  const monthLabel = firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const entryMap = new Map<string, string[]>();
  for (const entry of mealEntries) {
    if (!entryMap.has(entry.date)) entryMap.set(entry.date, []);
    const title =
      entry.type === 'recipe' && entry.recipeId
        ? (recipes.find((r) => r.id === entry.recipeId)?.title ?? '?')
        : entry.customTitle ?? '';
    entryMap.get(entry.date)!.push(title);
  }

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0" {...swipe}>
      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => applyMonth(-1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-slate-700">{monthLabel}</span>
        <button
          onClick={() => applyMonth(1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar grid (headers + cells) */}
      <div ref={gridRef} className="flex-1 flex flex-col gap-0.5 min-h-0">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-0.5">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-slate-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="flex-1 grid grid-cols-7 auto-rows-fr gap-0.5 min-h-0">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const iso = isoDate(new Date(year, month, day));
            const titles = entryMap.get(iso) ?? [];
            const isToday = iso === isoDate(today);
            return (
              <div
                key={i}
                className={[
                  'rounded-lg p-0.5 border border-transparent transition-colors',
                  titles.length > 0 ? 'bg-slate-50' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'text-[10px] text-center pt-0.5',
                    isToday ? 'font-bold text-amber-600' : 'font-semibold text-slate-500',
                  ].join(' ')}
                >
                  {day}
                </div>
                {titles.slice(0, 2).map((t, j) => (
                  <div
                    key={j}
                    className="mt-0.5 text-[8px] leading-tight text-slate-600 bg-amber-100 rounded px-0.5 truncate"
                  >
                    {t}
                  </div>
                ))}
                {titles.length > 2 && (
                  <div className="text-[8px] text-slate-400 text-center">+{titles.length - 2}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
