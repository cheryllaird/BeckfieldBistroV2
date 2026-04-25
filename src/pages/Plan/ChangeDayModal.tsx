import { useState } from 'react';
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useStore } from '../../store';
import { isoDate } from '../../lib/utils';
import type { MealEntry } from '../../types';

interface Props {
  entry: MealEntry;
  title: string;
  onClose: () => void;
}

export function ChangeDayModal({ entry, title, onClose }: Props) {
  const updateMealEntry = useStore((s) => s.updateMealEntry);
  const [selected, setSelected] = useState<string>(entry.date);

  const today = new Date();
  const todayIso = isoDate(today);

  // Start on the month of the current entry's date
  const entryDate = new Date(entry.date + 'T00:00:00');
  const [viewYear, setViewYear] = useState(entryDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(entryDate.getMonth());

  const applyMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const firstDay = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const handleConfirm = () => {
    if (selected === entry.date) {
      onClose();
      return;
    }
    updateMealEntry({ ...entry, date: selected });
    onClose();
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl flex flex-col max-h-[90dvh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Move to a different day</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Moving: <strong>{title}</strong>
        </p>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => applyMonth(-1)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-700">{monthLabel}</span>
          <button
            onClick={() => applyMonth(1)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1 mb-5">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-xs font-medium text-slate-400 py-1">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const iso = isoDate(new Date(viewYear, viewMonth, day));
            const isSelected = selected === iso;
            const isCurrent = entry.date === iso;
            const isToday = iso === todayIso;
            return (
              <button
                key={i}
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
                {day}
              </button>
            );
          })}
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
    </ModalPortal>
  );
}
