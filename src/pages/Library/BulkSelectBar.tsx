import { Share2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';

interface BulkSelectBarProps {
  count: number;
  onCancel: () => void;
  onShare: () => void;
}

/** Action bar for long-press selection. Portalled to escape <main>'s transform. */
export function BulkSelectBar({ count, onCancel, onShare }: BulkSelectBarProps) {
  return (
    <ModalPortal>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <button
            onClick={onCancel}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Cancel selection"
          >
            <X size={20} />
          </button>
          <span className="flex-1 text-sm font-semibold text-slate-700">{count} selected</span>
          <Button size="sm" onClick={onShare} disabled={count === 0}>
            <Share2 size={14} />
            Share {count > 0 ? count : ''}
          </Button>
        </div>
      </div>
    </ModalPortal>
  );
}
