import { useState } from 'react';
import { Coffee, ExternalLink, Loader, WifiOff, X } from 'lucide-react';
import { useStore } from '../store';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { KOFI_PANEL_URL, KOFI_URL } from '../lib/tips';
import { ModalPortal } from './ui/ModalPortal';

// Ko-fi's checkout opens PayPal/card windows as pop-ups. They must escape the
// sandbox to work (a sandboxed pop-up can't run checkout); they're full browser
// windows that show their own URL. Top-level navigation isn't allowed, so the
// panel can never navigate the app away. See ADR 0018.
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

/**
 * Ko-fi's donation panel in a bottom sheet (ADR 0018). Rendered once in
 * AppLayout and opened from the user menu, Settings or the thank-you note. The
 * iframe only exists while the sheet is open, so Ko-fi is never contacted
 * otherwise.
 */
export function SupportPanelModal() {
  const open = useStore((s) => s.supportPanelOpen);
  const close = useStore((s) => s.closeSupportPanel);
  if (!open) return null;
  return <Sheet onClose={close} />;
}

function Sheet({ onClose }: { onClose: () => void }) {
  const { isOnline } = useOnlineStatus();
  const [loaded, setLoaded] = useState(false);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-panel-title"
          className="relative z-10 w-full max-w-md h-[85dvh] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col animate-slide-up"
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
            <h3 id="support-panel-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Coffee size={18} className="text-amber-600" aria-hidden="true" />
              Buy me a coffee
            </h3>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative flex-1 min-h-0">
            {isOnline ? (
              <>
                {!loaded && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <Loader size={20} className="animate-spin" aria-label="Loading" />
                  </div>
                )}
                <iframe
                  src={KOFI_PANEL_URL}
                  title="Ko-fi donation panel"
                  sandbox={SANDBOX}
                  referrerPolicy="no-referrer"
                  onLoad={() => setLoaded(true)}
                  className="w-full h-full border-0"
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 h-full px-8 text-center">
                <WifiOff size={22} className="text-slate-400" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-700">You're offline</p>
                <p className="text-xs text-slate-500">Tipping needs an internet connection. Thanks for thinking of it!</p>
              </div>
            )}
          </div>

          <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 min-h-11 px-5 pb-[env(safe-area-inset-bottom)] border-t border-slate-100 text-xs font-medium text-amber-600 hover:text-amber-700"
          >
            Trouble paying here? Open Ko-fi in your browser <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </ModalPortal>
  );
}
