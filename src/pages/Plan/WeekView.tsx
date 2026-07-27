import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getWeekDays, isoDate } from '../../lib/utils';
import { useSwipeNavigate } from '../../hooks/useSwipeNavigate';
import { DayRow } from './DayRow';

interface WeekViewProps {
  weekOffset: number;
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>;
}

export function WeekView({ weekOffset, setWeekOffset }: WeekViewProps) {
  const days = getWeekDays(weekOffset);
  const rowsRef = useRef<HTMLDivElement>(null);

  // Weeks run forever in both directions, so there is no edge to resist at.
  const swipe = useSwipeNavigate({
    contentRef: rowsRef,
    onNext: () => setWeekOffset((w) => w + 1),
    onPrev: () => setWeekOffset((w) => w - 1),
  });

  const weekLabel = () => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    const start = days[0];
    return start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    // flex-1 so the gesture target runs to the bottom of the screen; no
    // min-h-0, so a tall week still grows the page instead of being clipped.
    <div className="flex-1 flex flex-col gap-3 overflow-hidden" {...swipe}>
      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-slate-700">{weekLabel()}</span>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day rows */}
      <div ref={rowsRef} className="flex-1 flex flex-col gap-2">
        {days.map((day) => (
          <DayRow key={isoDate(day)} date={day} />
        ))}
      </div>
    </div>
  );
}
