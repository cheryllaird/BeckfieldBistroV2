import { useState } from 'react';
import { X, Plus, Package, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { categorize, generateId, normalizeIngredientName } from '../../lib/utils';

interface Props {
  onClose: () => void;
}

export function PantryModal({ onClose }: Props) {
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
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col max-h-[85dvh] animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-amber-500" />
              <h3 className="text-base font-semibold text-slate-800">Store Cupboard</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <p className="px-4 pt-3 pb-1 text-xs text-slate-400 shrink-0">
            Items here are skipped when generating your shopping list.
          </p>

          {/* Add item */}
          <div className="flex gap-2 px-4 py-3 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. olive oil, cumin, vinegar…"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-colors"
            />
            <Button size="sm" onClick={handleAdd} disabled={!input.trim()} aria-label="Add">
              <Plus size={14} />
            </Button>
          </div>

          {/* Pantry list */}
          <div className="overflow-y-auto flex-1 px-4 pb-4">
            {pantryItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Package size={32} className="text-slate-200" />
                <p className="text-sm text-slate-400">
                  No items yet. Add oils, spices, and staples you always have in stock.
                </p>
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
        </div>
      </div>
    </ModalPortal>
  );
}
