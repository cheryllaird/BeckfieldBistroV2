import { useRef } from 'react';
import { Link, Loader, WifiOff, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user clears the field, so the page can drop this tab's error. */
  onClear: () => void;
  onExtract: () => void;
  isOnline: boolean;
  isExtracting: boolean;
  error: string;
}

/** URL tab: the user gives a recipe page's link and the server reads the page. */
export function UrlInput({ value, onChange, onClear, onExtract, isOnline, isExtracting, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-3 animate-in">
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
          <WifiOff size={15} className="shrink-0" />
          Recipe extraction requires an internet connection. Switch to Manual to add a recipe offline.
        </div>
      )}
      <Input
        label="Recipe URL"
        placeholder="https://cooking.nytimes.com/recipes/…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="url"
        disabled={!isOnline}
        inputRef={inputRef}
        trailing={
          value && !isExtracting ? (
            <button
              type="button"
              onClick={() => {
                onChange('');
                onClear();
                inputRef.current?.focus();
              }}
              className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Clear URL"
            >
              <X size={15} />
            </button>
          ) : undefined
        }
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button fullWidth onClick={onExtract} disabled={isExtracting || !value.trim() || !isOnline}>
        {isExtracting ? (
          <>
            <Loader size={14} className="animate-spin" /> Extracting…
          </>
        ) : (
          <>
            <Link size={14} /> Extract recipe
          </>
        )}
      </Button>
    </div>
  );
}
