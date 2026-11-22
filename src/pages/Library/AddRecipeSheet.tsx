import { useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Link, PencilLine, type LucideIcon } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import type { CaptureMode } from '../NewRecipe/captureMode';

const OPTIONS: { mode: CaptureMode; label: string; hint: string; icon: LucideIcon; needsOnline: boolean }[] = [
  { mode: 'upload', label: 'Photo of a recipe', hint: 'A cookbook page, card or screenshot', icon: Camera, needsOnline: true },
  { mode: 'url', label: 'Paste a link', hint: 'Any recipe website', icon: Link, needsOnline: true },
  { mode: 'manual', label: 'Type it in', hint: 'Works offline', icon: PencilLine, needsOnline: false },
];

/** The three ways to add a recipe. Each opens New Recipe on the matching mode. */
export function AddRecipeSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();

  return (
    <BottomSheet title="Add a recipe" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {OPTIONS.map(({ mode, label, hint, icon: Icon, needsOnline }) => {
          const disabled = needsOnline && !isOnline;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              // Replace the sheet's history entry so Back on New Recipe returns to the Library.
              onClick={() => navigate(`/recipes/new?mode=${mode}`, { replace: true })}
              className="flex items-center gap-3 min-h-14 p-3 rounded-2xl border border-slate-200 text-left transition-colors enabled:hover:bg-slate-50 enabled:active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="w-10 h-10 shrink-0 rounded-xl bg-amber-soft text-amber-600 flex items-center justify-center">
                <Icon size={18} aria-hidden />
              </span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-sm font-semibold text-slate-900">{label}</span>
                <span className="text-xs text-slate-500">{disabled ? 'Needs a connection' : hint}</span>
              </span>
              <ChevronRight size={16} className="text-slate-300" aria-hidden />
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
