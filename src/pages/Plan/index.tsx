import { useState } from 'react';
import { CalendarDays, History } from 'lucide-react';
import { WeekView } from './WeekView';
import { HistoryView } from './HistoryView';

type View = 'plan' | 'history';

export function PlanPage() {
  const [view, setView] = useState<View>('plan');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Meal Plan</h2>
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

      {view === 'plan' && <WeekView />}
      {view === 'history' && <HistoryView />}
    </div>
  );
}
