import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useStore } from '../../store';
import { getWeekDays, isoDate, formatDayLabel } from '../../lib/utils';
import type { MealEntry } from '../../types';

interface Props {
  entry: MealEntry;
  title: string;
  onClose: () => void;
}

export function ChangeDayModal({ entry, title, onClose }: Props) {
  const updateMealEntry = useStore((s) => s.updateMealEntry);
  const [selected, setSelected] = useState<string>(entry.date);

  const lastWeek = getWeekDays(-1);
  const thisWeek = getWeekDays(0);
  const nextWeek = getWeekDays(1);

  const weeks = [
    { label: 'Last Week', days: lastWeek },
    { label: 'This Week', days: thisWeek },
    { label: 'Next Week', days: nextWeek },
  ];

  const handleConfirm = () => {
    if (selected === entry.date) {
      onClose();
      return;
    }
    updateMealEntry({ ...entry, date: selected });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl p-5 shadow-xl animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Move to a different day</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Moving: <strong>{title}</strong>
        </p>

        <div className="flex flex-col gap-3 mb-5">
          {weeks.map(({ label, days }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
              <div className="grid grid-cols-7 gap-1">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-medium text-slate-300 pb-0.5">
                    {d}
                  </div>
                ))}
                {days.map((day) => {
                  const iso = isoDate(day);
                  const { monthDay, isToday } = formatDayLabel(day);
                  const isSelected = selected === iso;
                  const isCurrent = entry.date === iso;
                  return (
                    <button
                      key={iso}
                      onClick={() => setSelected(iso)}
                      className={[
                        'aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all',
                        isSelected
                          ? 'bg-amber-500 text-white shadow-sm'
                          : isCurrent
                          ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-300'
                          : isToday
                          ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-300'
                          : 'hover:bg-slate-50 text-slate-700',
                      ].join(' ')}
                    >
                      {monthDay.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleConfirm}>
            <Check size={14} /> Move
          </Button>
        </div>
      </div>
    </div>
  );
}
