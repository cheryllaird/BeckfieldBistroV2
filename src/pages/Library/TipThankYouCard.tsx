import { Heart, X } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { KofiLink } from '../../components/KofiLink';

/**
 * One-off thank-you shown above the library after the user's 5th or 10th saved
 * recipe (see lib/tips.ts). Dismissing it, or tapping the tip link, hides it
 * for good.
 */
export function TipThankYouCard() {
  const milestone = useStore((s) => s.tipPromptMilestone);
  const dismiss = useStore((s) => s.dismissTipPrompt);
  if (milestone === null) return null;

  return (
    <section
      aria-label="Thank you"
      className="relative flex flex-col gap-3 p-4 rounded-2xl bg-amber-soft border border-amber-100 shadow-sm animate-in"
    >
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <Heart size={18} className="text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-slate-900">
            {milestone} recipes saved — thank you!
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            It's lovely to see your bistro growing. If Beckfield Bistro is saving you time in the
            kitchen, a small tip helps keep it running. No pressure at all — we won't ask again.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-7">
        <KofiLink onClick={dismiss}>Buy me a coffee</KofiLink>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Maybe later
        </Button>
      </div>
    </section>
  );
}
