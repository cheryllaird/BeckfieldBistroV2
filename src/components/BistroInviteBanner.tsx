import { useState } from 'react';
import { Store, User, X } from 'lucide-react';
import type { BistroInvite } from '../types';
import { useStore } from '../store';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Button } from './ui/Button';

interface Joined {
  bistroId: string;
  name: string;
}

function InviteRow({ invite, onJoined }: { invite: BistroInvite; onJoined: (j: Joined) => void }) {
  const acceptInvite = useStore((s) => s.acceptInvite);
  const declineInvite = useStore((s) => s.declineInvite);
  const { isOnline } = useOnlineStatus();
  const [busy, setBusy] = useState<'join' | 'decline' | null>(null);
  const [error, setError] = useState('');

  const run = async (kind: 'join' | 'decline') => {
    setBusy(kind);
    setError('');
    try {
      // Accepting removes the invite from the store (and so this row), so
      // the "joined" confirmation is owned by the parent.
      if (kind === 'join') onJoined({ bistroId: await acceptInvite(invite), name: invite.bistroName });
      else await declineInvite(invite.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
      {invite.fromAvatar ? (
        <img src={invite.fromAvatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-amber-soft flex items-center justify-center shrink-0">
          <User size={16} className="text-amber-500" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">{invite.fromName}</span> invited you to{' '}
          <span className="font-semibold">{invite.bistroName}</span>
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          You'll share its recipes, meal plan and lists. Your own bistro stays as it is.
        </p>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        {!isOnline && <p className="text-xs text-slate-500 mt-1">Go online to respond.</p>}
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={() => run('join')} disabled={!!busy || !isOnline}>
            {busy === 'join' ? 'Joining…' : 'Join'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run('decline')} disabled={!!busy || !isOnline}>
            {busy === 'decline' ? '…' : 'Decline'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BistroInviteBanner() {
  const pendingInvites = useStore((s) => s.pendingInvites);
  const removedFromBistro = useStore((s) => s.removedFromBistro);
  const dismissRemovedNotice = useStore((s) => s.dismissRemovedNotice);
  const switchBistro = useStore((s) => s.switchBistro);
  const [joined, setJoined] = useState<Joined | null>(null);

  if (!pendingInvites.length && !removedFromBistro && !joined) return null;

  return (
    <div className="max-w-md mx-auto w-full px-4 pt-3 flex flex-col gap-2">
      {removedFromBistro && (
        <div className="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-xl p-3">
          <Store size={16} className="text-slate-500 shrink-0" />
          <p className="flex-1 text-sm text-slate-700">
            You're no longer a member of <strong>{removedFromBistro}</strong>, so you're back in
            your own bistro.
          </p>
          <button onClick={dismissRemovedNotice} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {joined && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="flex-1 text-sm text-slate-700">
            You've joined <strong>{joined.name}</strong>. Switch between bistros from your
            profile menu.
          </p>
          <Button size="sm" onClick={() => { switchBistro(joined.bistroId); setJoined(null); }}>
            Open it
          </Button>
          <button onClick={() => setJoined(null)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {pendingInvites.map((invite) => (
        <InviteRow key={invite.id} invite={invite} onJoined={setJoined} />
      ))}
    </div>
  );
}
