import { ExternalLink } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { LEGAL } from '../../lib/legal';

const PAGES = [
  { label: 'Terms of Service', href: LEGAL.termsUrl },
  { label: 'Privacy Policy', href: LEGAL.privacyUrl },
  { label: 'Copyright and takedown', href: LEGAL.copyrightUrl },
].filter((p) => p.href);

/** Links to the published legal pages; hidden until any are set in lib/legal.ts. */
export function LegalCard() {
  if (PAGES.length === 0) return null;
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate-800">Legal</h3>
      {PAGES.map((p) => (
        <a
          key={p.label}
          href={p.href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 w-fit"
        >
          {p.label} <ExternalLink size={12} />
        </a>
      ))}
    </Card>
  );
}
