import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Package, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { categorize, generateId, normalizeIngredientName } from '../../lib/utils';

export function PantryPage() {
  const navigate = useNavigate();
  const { pantryItems, addPantryItem, removePantryItem } = useStore();
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    const alreadyExists = pantryItems.some(
      (p) => p.normalizedName === normalizeIngredientName(name)
    );
    if (alreadyExists) { setInput(''); return; }
    addPantryItem({
      id: generateId(),
      name,
      normalizedName: normalizeIngredientName(name),
      category: categorize(name),
      createdAt: new Date().toISOString(),
    });
    setInput('');
  };

  const sorted = [...pantryItems].sort((a, b) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <Package size={18} className="text-amber-500" />
          <h2 className="text-xl font-bold text-slate-800">Store Cupboard</h2>
        </div>
      </div>

      <p className="text-sm text-slate-400">
        Ingredients you always have in stock. These are skipped when generating your shopping list.
      </p>

      {/* Add item */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. olive oil, cumin, balsamic vinegar…"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-colors"
        />
        <Button size="sm" onClick={handleAdd} disabled={!input.trim()} aria-label="Add">
          <Plus size={14} />
        </Button>
      </div>

      {/* Pantry list */}
      {pantryItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Package size={40} className="text-slate-200" />
          <div>
            <p className="text-base font-semibold text-slate-700">Nothing here yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Add oils, spices, and staples you always have in stock.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {sorted.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-100"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm text-slate-700 capitalize">{item.name}</span>
                <span className="ml-2 text-[10px] text-slate-400 font-medium">{item.category}</span>
              </div>
              <button
                onClick={() => removePantryItem(item.id)}
                className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
                aria-label={`Remove ${item.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
