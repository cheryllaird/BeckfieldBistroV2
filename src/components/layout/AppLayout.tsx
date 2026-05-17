import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { WifiOff, Wifi } from 'lucide-react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function NetworkBanner() {
  const { isOnline, justReconnected } = useOnlineStatus();

  if (isOnline && !justReconnected) return null;

  if (!isOnline) {
    return (
      <div className="bg-slate-700 text-white text-xs font-medium px-4 py-2 flex items-center justify-center gap-2">
        <WifiOff size={13} />
        You're offline — meal plan and shopping list still work
      </div>
    );
  }

  return (
    <div className="bg-green-600 text-white text-xs font-medium px-4 py-2 flex items-center justify-center gap-2">
      <Wifi size={13} />
      Back online — syncing your changes
    </div>
  );
}

export function AppLayout() {
  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      <ScrollToTop />
      <Header />
      <NetworkBanner />
      <main className="flex-1 flex flex-col max-w-md mx-auto w-full px-4 pt-4 pb-28 animate-in">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
