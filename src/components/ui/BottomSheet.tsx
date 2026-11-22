import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { ModalPortal } from './ModalPortal';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const HISTORY_KEY = 'bottomSheet';

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal sheet that rises from the bottom of the screen.
 *
 * - Escape, a tap on the backdrop and the browser Back button all close it.
 *   Back is caught with a history entry pushed on open, so it closes the sheet
 *   instead of leaving the page.
 * - Focus moves to the first control on open, Tab stays inside the sheet, and
 *   focus returns to whatever opened it on close.
 *
 * To navigate away from inside the sheet, use `navigate(to, { replace: true })`:
 * it replaces the sheet's history entry, so Back on the next page returns here.
 */
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const mountedRef = useRef(false);

  // Push a history entry so Back closes the sheet; popping it calls onClose.
  useEffect(() => {
    mountedRef.current = true;
    const opener = document.activeElement as HTMLElement | null;
    // Idempotent so StrictMode's mount → unmount → mount doesn't stack two entries.
    if (!window.history.state?.[HISTORY_KEY]) window.history.pushState({ [HISTORY_KEY]: true }, '');
    const onPopstate = () => onCloseRef.current();
    window.addEventListener('popstate', onPopstate);

    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    return () => {
      mountedRef.current = false;
      window.removeEventListener('popstate', onPopstate);
      opener?.focus?.();
      // Closed some other way (e.g. the parent unmounted it): drop our entry. Deferred so a
      // StrictMode remount, which finds the entry still there, keeps it.
      setTimeout(() => {
        if (!mountedRef.current && window.history.state?.[HISTORY_KEY]) window.history.back();
      }, 0);
    };
  }, []);

  // Closing goes through history so the pushed entry never lingers.
  const dismiss = useCallback(() => {
    if (window.history.state?.[HISTORY_KEY]) window.history.back();
    else onCloseRef.current();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 animate-fade"
        onClick={dismiss}
        data-testid="bottom-sheet-backdrop"
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-white rounded-t-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-4 shadow-xl animate-slide-up outline-none"
        >
          <span className="self-center w-10 h-1 rounded-full bg-slate-200" aria-hidden />
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}
