import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react';
import { getWeekDays, isoDate } from '../../lib/utils';
import { DayRow } from './DayRow';

export function WeekView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekDays(weekOffset);
  const touchStartX = useRef<number | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    if (rowsRef.current) {
      rowsRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !rowsRef.current) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    rowsRef.current.style.transform = `translateX(${delta}px)`;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !rowsRef.current) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    const el = rowsRef.current;
    const width = el.offsetWidth;

    if (Math.abs(delta) > 50) {
      const goNext = delta < 0;
      // Slide current week out
      el.style.transition = 'transform 0.2s ease-out';
      el.style.transform = `translateX(${goNext ? -width : width}px)`;

      setTimeout(() => {
        // Change week, snap to opposite side off-screen, then slide in
        setWeekOffset((w) => w + (goNext ? 1 : -1));
        el.style.transition = 'none';
        el.style.transform = `translateX(${goNext ? width : -width}px)`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = 'transform 0.2s ease-out';
            el.style.transform = 'translateX(0)';
          });
        });
      }, 200);
    } else {
      // Snap back
      el.style.transition = 'transform 0.2s ease-out';
      el.style.transform = 'translateX(0)';
    }
  };

  const weekLabel = () => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    const start = days[0];
    return start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      className="flex flex-col gap-3 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-semibold text-slate-700">{weekLabel()}</span>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
            >
              <CalendarCheck size={11} /> Today
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day rows */}
      <div ref={rowsRef} className="flex flex-col gap-2">
        {days.map((day) => (
          <DayRow key={isoDate(day)} date={day} />
        ))}
      </div>
    </div>
  );
}
