import { useState } from 'react';
import { User, X } from 'lucide-react';
import { useStore } from '../../store';
import type { Bistro, BistroInvite, BistroMember } from '../../types';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

interface Props {
  bistro: Bistro;
  outgoing: BistroInvite[];
  onRevoked: (inviteId: string) => void;
  canManage: boolean;
}

function Avatar({ member }: { member: Pick<BistroMember, 'avatar'> }) {
  return member.avatar ? (
    <img src={member.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-amber-soft flex items-center justify-center shrink-0">
      <User size={14} className="text-amber-500" />
    </div>
  );
}

// Members of a bistro plus its pending invites. Anyone can remove anyone
// except the owner (it's their home bistro) and themselves (that's Leave).
export function BistroMemberList({ bistro, outgoing, onRevoked, canManage }: Props) {
  const user = useStore((s) => s.user);
  const removeMember = useStore((s) => s.removeMember);
  const revokeInvite = useStore((s) => s.revokeInvite);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setConfirming(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const members = bistro.memberUids
    .filter((uid) => bistro.members[uid])
    .map((uid) => ({ uid, ...bistro.members[uid] }))
    // Owner first, then you, then everyone else by name.
    .sort((a, b) =>
      a.uid === bistro.ownerUid ? -1 : b.uid === bistro.ownerUid ? 1
        : a.uid === user?.uid ? -1 : b.uid === user?.uid ? 1
        : a.name.localeCompare(b.name),
    );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Members</p>

      {members.map((m) => (
        <div key={m.uid} className="flex items-center gap-3">
          <Avatar member={m} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm text-slate-800 truncate">{m.name}</span>
              {m.uid === user?.uid && <Badge>You</Badge>}
              {m.uid === bistro.ownerUid && <Badge variant="amber">Owner</Badge>}
            </div>
            <p className="text-xs text-slate-400 truncate">{m.email}</p>
          </div>
          {confirming === m.uid ? (
            <div className="flex gap-1">
              <Button size="sm" variant="danger" disabled={busy} onClick={() => act(() => removeMember(bistro.id, m.uid))}>
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          ) : (
            canManage && m.uid !== user?.uid && m.uid !== bistro.ownerUid && (
              <button
                onClick={() => setConfirming(m.uid)}
                className="text-slate-400 hover:text-red-500"
                aria-label={`Remove ${m.name}`}
              >
                <X size={16} />
              </button>
            )
          )}
        </div>
      ))}

      {outgoing.map((inv) => (
        <div key={inv.id} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-dashed border-slate-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500 truncate">{inv.toEmail}</p>
            <p className="text-xs text-slate-400">Invited — waiting for them to join</p>
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => act(async () => { await revokeInvite(inv.id); onRevoked(inv.id); })}
            >
              Revoke
            </Button>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
