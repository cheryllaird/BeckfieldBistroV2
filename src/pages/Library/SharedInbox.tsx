import { useState } from 'react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { IncomingShareCard } from './IncomingShareCard';

/** The "Shared with you" tab: every waiting share, with Save all and Dismiss all. */
export function SharedInbox() {
  const incomingShares = useStore((s) => s.incomingShares);
  const acceptAllShares = useStore((s) => s.acceptAllShares);
  const dismissAllShares = useStore((s) => s.dismissAllShares);
  const [savingAll, setSavingAll] = useState(false);
  const [dismissingAll, setDismissingAll] = useState(false);
  const busy = savingAll || dismissingAll;

  return (
    <section className="flex flex-col gap-2 animate-in" aria-label="Shared with you">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setDismissingAll(true);
            try { await dismissAllShares(); } finally { setDismissingAll(false); }
          }}
        >
          {dismissingAll ? 'Dismissing…' : 'Dismiss all'}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setSavingAll(true);
            try { await acceptAllShares(); } finally { setSavingAll(false); }
          }}
        >
          {savingAll ? 'Saving…' : 'Save all'}
        </Button>
      </div>
      {incomingShares.map((share) => (
        <IncomingShareCard key={share.id} share={share} />
      ))}
    </section>
  );
}
