import { Loader2 } from 'lucide-react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

// Shown on a refresh for a returning user while the persisted library loads
// from IndexedDB. It keeps the app's own chrome (header and nav) on screen so
// a refresh reads as "loading" rather than flashing to the full-screen splash.
export function AppShellLoading() {
  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      <Header />
      <main
        className="flex-1 flex flex-col items-center justify-center gap-2 max-w-md mx-auto w-full px-4 pb-28 text-slate-400"
        role="status"
        aria-live="polite"
      >
        <Loader2 size={22} className="animate-spin text-amber-500" />
        <p className="text-sm">Loading your bistro…</p>
      </main>
      <BottomNav />
    </div>
  );
}
