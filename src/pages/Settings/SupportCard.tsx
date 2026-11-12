import { Card } from '../../components/ui/Card';
import { KofiLink } from '../../components/KofiLink';

/** A quiet, always-available way to tip; the only other ask is the one-off library note. */
export function SupportCard() {
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate-800">Support Beckfield Bistro</h3>
      <p className="text-xs text-slate-500">
        Enjoying the app? A tip helps cover its running costs.
      </p>
      <div>
        <KofiLink>Tip on Ko-fi</KofiLink>
      </div>
    </Card>
  );
}
