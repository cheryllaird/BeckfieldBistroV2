import { useEffect } from 'react';

const TOAST_MS = 4000;

// Short confirmation above the bottom nav, with an Undo shortcut. Used when an
// action takes an item out of view (e.g. moving it to the other list).
export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 px-4 flex justify-center pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto w-full max-w-md flex items-center justify-between gap-3 rounded-xl bg-ink-900 text-white pl-4 pr-1 shadow-lg animate-slide-up"
      >
        <span className="text-sm truncate">{message}</span>
        <button
          onClick={() => {
            onUndo();
            onDismiss();
          }}
          className="shrink-0 min-h-11 px-3 text-sm font-semibold text-amber-400"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
