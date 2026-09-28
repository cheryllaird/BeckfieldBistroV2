import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Button } from './ui/Button';

// Held up while an older account's library is copied into its bistro (see
// runMigration in store/index.ts). New accounts have nothing to copy and finish
// in one round trip, so the screen waits a moment before appearing rather than
// flashing past.
const SHOW_AFTER_MS = 600;

export function MigrationScreen() {
  const migration = useStore((s) => s.migration);
  const retryMigration = useStore((s) => s.retryMigration);
  const skipMigration = useStore((s) => s.skipMigration);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!migration || (!visible && migration.status === 'running')) {
    return <div className="fixed inset-0 bg-ink-950" />;
  }

  return (
    <div className="fixed inset-0 bg-ink-950 flex flex-col items-center justify-center gap-5 px-6 text-center z-50">
      <img src="/logo-icon.png" alt="Beckfield Bistro" className="w-20 h-20" />
      {migration.status === 'running' ? (
        <div>
          <h1 className="text-xl font-bold text-white">Setting up your bistro…</h1>
          <p className="text-sm text-amber-400 mt-1">
            {migration.copied > 0
              ? `Moved ${migration.copied} item${migration.copied === 1 ? '' : 's'} so far`
              : 'This only happens once'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <div>
            <h1 className="text-xl font-bold text-white">Couldn't finish setting up</h1>
            <p className="text-sm text-slate-300 mt-1">{migration.error}</p>
            <p className="text-xs text-slate-400 mt-2">
              Nothing has been lost — your recipes are exactly where they were.
            </p>
          </div>
          <Button fullWidth onClick={retryMigration}>Try again</Button>
          <Button fullWidth variant="ghost" className="text-slate-300 hover:bg-white/10" onClick={skipMigration}>
            Continue for now
          </Button>
        </div>
      )}
    </div>
  );
}
