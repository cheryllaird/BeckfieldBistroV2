import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export function AppLayout() {
  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      <ScrollToTop />
      <Header />
      <main className="flex-1 flex flex-col max-w-md mx-auto w-full px-4 pt-4 pb-28 animate-in">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
