import { useStore } from '../store';
import { SHELF_ORDER, shelfOf } from '../lib/ingredients';

// Second row of choices in an item sheet, shown for Pantry items only. Picking
// a shelf is remembered for the ingredient across the bistro; picking the
// worked-out shelf again forgets the choice (handled by the store).
export function ShelfPicker({ name }: { name: string }) {
  const shelfOverrides = useStore((s) => s.shelfOverrides);
  const rememberShelf = useStore((s) => s.rememberShelf);
  const current = shelfOf(name, shelfOverrides);

  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs font-medium text-slate-500">Shelf</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Shelf">
        {SHELF_ORDER.map((shelf) => (
          <button
            key={shelf}
            aria-pressed={current === shelf}
            onClick={() => rememberShelf(name, shelf)}
            className={[
              'min-h-10 px-3.5 rounded-full text-sm border transition-colors',
              current === shelf
                ? 'bg-amber-soft border-amber-400 text-amber-700 font-semibold'
                : 'bg-white border-slate-200 text-slate-600',
            ].join(' ')}
          >
            {shelf}
          </button>
        ))}
      </div>
    </section>
  );
}
