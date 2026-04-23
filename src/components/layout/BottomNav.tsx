import { NavLink } from 'react-router-dom';
import { BookOpen, CalendarDays, ShoppingCart } from 'lucide-react';

const navItems = [
  { to: '/recipes', icon: BookOpen, label: 'Recipes' },
  { to: '/plan', icon: CalendarDays, label: 'Plan' },
  { to: '/list', icon: ShoppingCart, label: 'List' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 w-full">
      <div className="bg-white border-t border-slate-200 shadow-lg shadow-slate-200 px-2 py-1.5">
        <div className="flex items-center justify-around">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all duration-200',
                  isActive
                    ? 'text-amber-500 bg-amber-soft'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
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
