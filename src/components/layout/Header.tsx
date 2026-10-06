import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LogOut, Settings, User } from 'lucide-react';
import { useStore, scopeOf } from '../../store';
import type { Bistro } from '../../types';

export function Header() {
  const { user, signOut, bistros, switchBistro } = useStore();
  const activeId = useStore(scopeOf);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Own bistro first, then the rest by name.
  const bistroList = Object.values(bistros).sort((a: Bistro, b: Bistro) =>
    a.id === user?.uid ? -1 : b.id === user?.uid ? 1 : a.name.localeCompare(b.name),
  );
  const activeBistro = activeId ? bistros[activeId] : undefined;
  const showBistros = bistroList.length > 1;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo-wordmark.png" alt="Beckfield Bistro" className="h-8 w-auto shrink-0" />
          {activeBistro && (
            <p className="text-xs text-slate-400 truncate">{activeBistro.name}</p>
          )}
        </div>

        {user && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              aria-label="Profile menu"
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-soft flex items-center justify-center">
                  <User size={14} className="text-amber-500" />
                </div>
              )}
              <span className="text-sm font-medium text-slate-700 hidden sm:block">
                {user.name.split(' ')[0]}
              </span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-48 max-w-64 animate-in">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-800">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                    <p className="text-xs text-slate-300 mt-1">v{__APP_VERSION__} · {__APP_BUILD__}</p>
                  </div>
                  {showBistros && (
                    <div className="py-1 border-b border-slate-100">
                      <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Bistros
                      </p>
                      {bistroList.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => { switchBistro(b.id); setMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors text-left"
                        >
                          <span className="w-3.5 shrink-0">
                            {b.id === activeId && <Check size={14} className="text-amber-500" />}
                          </span>
                          <span className="truncate">{b.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { navigate('/settings'); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Settings size={14} />
                    Settings
                  </button>
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
