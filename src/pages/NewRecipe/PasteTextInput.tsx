import { ClipboardPaste, Loader, WifiOff } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { MAX_PASTED_TEXT_CHARS } from '../../lib/recipeExtraction';

interface Props {
  text: string;
  onTextChange: (text: string) => void;
  link: string;
  onLinkChange: (link: string) => void;
  onExtract: () => void;
  isOnline: boolean;
  isExtracting: boolean;
  error: string;
}

/** Shown once the text is this close to the limit, so a long paste isn't a surprise. */
const COUNT_FROM = MAX_PASTED_TEXT_CHARS - 2_000;

/**
 * Paste text tab: the user copies a recipe from a page in their own browser
 * (for sites that block automatic imports) and pastes it here. The optional
 * link is kept as the recipe's source; it is never fetched.
 */
export function PasteTextInput({ text, onTextChange, link, onLinkChange, onExtract, isOnline, isExtracting, error }: Props) {
  const canExtract = isOnline && !isExtracting && text.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 animate-in">
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
          <WifiOff size={15} className="shrink-0" />
          Recipe extraction requires an internet connection. Switch to Manual to add a recipe offline.
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="paste-recipe-text" className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          Recipe text
        </label>
        <textarea
          id="paste-recipe-text"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          maxLength={MAX_PASTED_TEXT_CHARS}
          rows={8}
          disabled={!isOnline}
          placeholder="Copy the recipe from the website (title, ingredients and method) and paste it here."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition-colors outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-soft resize-y min-h-40"
        />
        {text.length >= COUNT_FROM && (
          <p className="text-xs text-slate-400 text-right">
            {text.length.toLocaleString()} / {MAX_PASTED_TEXT_CHARS.toLocaleString()}
          </p>
        )}
      </div>
      <Input
        label="Link to the original (optional)"
        placeholder="https://…"
        type="url"
        value={link}
        onChange={(e) => onLinkChange(e.target.value)}
        disabled={!isOnline}
        hint="Saved as the recipe's source. We don't open it."
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button fullWidth onClick={onExtract} disabled={!canExtract}>
        {isExtracting ? (
          <>
            <Loader size={14} className="animate-spin" /> Extracting…
          </>
        ) : (
          <>
            <ClipboardPaste size={14} /> Extract recipe
          </>
        )}
      </Button>
    </div>
  );
}
