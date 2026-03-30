import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getWeekDays, isoDate } from '../../lib/utils';
import { DayRow } from './DayRow';

export function WeekView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekDays(weekOffset);

  const weekLabel = () => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    const start = days[0];
    return start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex flex-col gap-3">
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
      <div className="flex flex-col gap-2 animate-in">
        {days.map((day) => (
          <DayRow key={isoDate(day)} date={day} />
        ))}
      </div>
    </div>
  );
}
