import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarDays, ShoppingCart } from 'lucide-react';

const navItems = [
  { to: '/recipes', icon: BookOpen, label: 'Recipes' },
  { to: '/plan', icon: CalendarDays, label: 'Plan' },
  { to: '/list', icon: ShoppingCart, label: 'List' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-xs">
      <div className="mx-4 bg-ink-950 rounded-2xl border border-white/10 shadow-lg shadow-black/40 px-2 py-1.5">
        <div className="flex items-center justify-around">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all duration-200',
                  isActive
                    ? 'text-amber-400 bg-white/10'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
