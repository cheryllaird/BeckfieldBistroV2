import { UtensilsCrossed, X } from 'lucide-react';
import { formatQuantity } from '../../lib/ingredients';
import type { MealSource } from '../../types';
import { ModalPortal } from '../../components/ui/ModalPortal';

export function MealSourcesModal({
  sources,
  onClose,
}: {
  sources: MealSource[];
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl p-5 shadow-xl w-full max-w-xs flex flex-col gap-4 animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Used in meals</p>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {sources.map((src, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-50 last:border-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <UtensilsCrossed size={13} className="text-amber-500" />
                  </div>
                  <span className="text-sm text-slate-700 truncate">{src.recipeTitle}</span>
                </div>
                <span className="text-xs text-slate-400 shrink-0 font-medium">
                  {src.scaledQuantity > 0 ? formatQuantity(src.scaledQuantity) : ''}
                  {src.unit ? ` ${src.unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
