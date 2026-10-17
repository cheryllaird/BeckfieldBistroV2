import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Markdown } from '../../legal/Markdown';
import { LEGAL_PAGES, type LegalPath } from '../../legal/pages';

// The public legal pages, rendered outside the sign-in gate (see App.tsx).

export function LegalPage({ path }: { path: LegalPath }) {
  const page = LEGAL_PAGES[path];

  useEffect(() => {
    document.title = `${page.title} · Beckfield Bistro`;
    window.scrollTo(0, 0);
    return () => { document.title = 'Beckfield Bistro'; };
  }, [page.title]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
        <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 w-fit">
          <ArrowLeft size={16} /> Beckfield Bistro
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs border-b border-slate-100 pb-3">
          {(Object.keys(LEGAL_PAGES) as LegalPath[]).map((p) => (
            <Link
              key={p}
              to={p}
              className={p === path ? 'font-semibold text-slate-900' : 'text-amber-700 hover:text-amber-800'}
              aria-current={p === path ? 'page' : undefined}
            >
              {LEGAL_PAGES[p].title}
            </Link>
          ))}
        </nav>
        <article className="flex flex-col gap-3">
          <Markdown source={page.source} />
        </article>
      </div>
    </div>
  );
}
