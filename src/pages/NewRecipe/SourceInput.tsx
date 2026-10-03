import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Input } from '../../components/ui/Input';

interface Props {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}

/**
 * Source field with an in-app suggestion list. Replaces the native <datalist>,
 * whose popup is styled by the browser and renders inconsistently (especially on mobile).
 */
export function SourceInput({ value, onChange, suggestions }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, 6);
  }, [value, suggestions]);

  const showList = open && matches.length > 0;

  const choose = (s: string) => {
    onChange(s);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        label="Source"
        placeholder="e.g. NYT Cooking"
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the choice lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              className={[
                'cursor-pointer truncate px-4 py-2 text-sm text-slate-800',
                i === active ? 'bg-amber-50' : 'hover:bg-slate-50',
              ].join(' ')}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
