import { Plus } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';

/**
 * The Library's main action: a pill centred just above the bottom nav.
 * Portalled to <body> because <main> keeps a transform from its entrance
 * animation, which would otherwise break `position: fixed`.
 */
export function AddRecipePill({ onClick }: { onClick: () => void }) {
  return (
    <ModalPortal>
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center pointer-events-none">
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-auto inline-flex items-center gap-2 min-h-12 px-5 rounded-full bg-amber-500 text-ink-950 text-sm font-semibold shadow-lg shadow-amber-500/30 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
        >
          <Plus size={18} strokeWidth={2.5} aria-hidden />
          Add recipe
        </button>
      </div>
    </ModalPortal>
  );
}
