import { useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { useStore } from '../../store';

export function Header() {
  const { user, signOut } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-ink-950 border-b border-white/10">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/logo-icon.svg" alt="BB" className="h-9 w-9 rounded-full" />
          <span className="text-base font-bold text-white tracking-tight">
            Beckfield Bistro
          </span>
        </div>

        {user && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-ink-800 transition-colors"
              aria-label="Profile menu"
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <User size={14} className="text-amber-400" />
                </div>
              )}
              <span className="text-sm font-medium text-white/80 hidden sm:block">
                {user.name.split(' ')[0]}
              </span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-40 animate-in">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-800">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                  <button
                    onClick={() => { signOut(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
