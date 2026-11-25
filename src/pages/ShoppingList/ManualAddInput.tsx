import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface ManualAddInputProps {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
}

/** Text box and button for typing an item straight onto the list. */
export function ManualAddInput({ value, onChange, onAdd }: ManualAddInputProps) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        placeholder="Add item manually…"
        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-colors"
      />
      <Button size="sm" onClick={onAdd} disabled={!value.trim()} aria-label="Add">
        <Plus size={14} />
      </Button>
    </div>
  );
}
