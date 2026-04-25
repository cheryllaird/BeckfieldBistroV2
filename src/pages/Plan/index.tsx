import { useState } from 'react';
import { CalendarDays, History, CalendarCheck } from 'lucide-react';
import { WeekView } from './WeekView';
import { HistoryView } from './HistoryView';

type View = 'plan' | 'history';

export function PlanPage() {
  const [view, setView] = useState<View>('plan');
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const showToday = view === 'plan'
    ? weekOffset !== 0
    : year !== today.getFullYear() || month !== today.getMonth();

  const goToToday = () => {
    if (view === 'plan') {
      setWeekOffset(0);
    } else {
      setYear(today.getFullYear());
      setMonth(today.getMonth());
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Meal Plan</h2>
        <div className="flex items-center gap-2">
          {showToday && (
            <button
              onClick={goToToday}
              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
            >
              <CalendarCheck size={11} /> Today
            </button>
          )}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-0.5">
            <button
              onClick={() => setView('plan')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                view === 'plan'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <CalendarDays size={12} /> Plan
            </button>
            <button
              onClick={() => setView('history')}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                view === 'history'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <History size={12} /> History
            </button>
          </div>
        </div>
      </div>

      {view === 'plan' && <WeekView weekOffset={weekOffset} setWeekOffset={setWeekOffset} />}
      {view === 'history' && <HistoryView year={year} month={month} setYear={setYear} setMonth={setMonth} />}
    </div>
  );
}
