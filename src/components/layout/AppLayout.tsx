import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      <Header />
      <main className="flex-1 max-w-md mx-auto w-full px-4 pt-4 pb-28 animate-in">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
