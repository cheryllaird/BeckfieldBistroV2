import { ShoppingCart, Package, Zap } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { ShoppingListType } from '../../types';

interface EmptyListStateProps {
  list: ShoppingListType;
  onGenerate: () => void;
}

/** Shown in place of the items when the active list has none. */
export function EmptyListState({ list, onGenerate }: EmptyListStateProps) {
  const immediate = list === 'immediate';
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center animate-fade">
      {immediate ? (
        <ShoppingCart size={48} className="text-slate-200" />
      ) : (
        <Package size={48} className="text-slate-200" />
      )}
      <div>
        <p className="text-base font-semibold text-slate-700">
          Your {immediate ? 'Immediate' : 'Stock up'} list is empty
        </p>
        <p className="text-sm text-slate-400 mt-1">
          {immediate
            ? 'Generate from your meal plan or add items manually'
            : 'Add items you want to keep topped up'}
        </p>
      </div>
      {immediate && (
        <Button onClick={onGenerate}>
          <Zap size={14} /> Generate from plan
        </Button>
      )}
    </div>
  );
}
