import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, UserPlus, X } from 'lucide-react';
import { useStore, scopeOf } from '../../store';
import { fetchBistroInvites, placeholderBistro } from '../../lib/bistro';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import type { BistroInvite } from '../../types';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { BistroMemberList } from './BistroMemberList';
import { InviteMemberModal } from './InviteMemberModal';

// Manages the bistro being viewed: its name, members and pending invites, and
// lists the user's other bistros. Switching also lives in the header menu.
export function BistroCard() {
  const user = useStore((s) => s.user);
  const bistros = useStore((s) => s.bistros);
  const bistroMigrated = useStore((s) => s.bistroMigrated);
  const activeId = useStore(scopeOf);
  const renameBistro = useStore((s) => s.renameBistro);
  const leaveBistro = useStore((s) => s.leaveBistro);
  const switchBistro = useStore((s) => s.switchBistro);
  const refreshInvites = useStore((s) => s.refreshInvites);
  const { isOnline } = useOnlineStatus();

  const isOwnBistro = activeId === user?.uid;
  // Your own bistro always exists, even before its doc has loaded (or when it
  // can't be read), so fall back to the placeholder rather than hiding the card.
  const bistro = activeId
    ? (bistros[activeId] ?? (isOwnBistro && user ? placeholderBistro(user) : undefined))
    : undefined;
  const canManage = isOnline && bistroMigrated;

  const [nameInput, setNameInput] = useState<string | null>(null); // null = not editing
  const [inviteOpen, setInviteOpen] = useState(false);
  const [outgoing, setOutgoing] = useState<BistroInvite[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadOutgoing = useCallback(() => {
    if (!activeId || !canManage) return;
    fetchBistroInvites(activeId).then(setOutgoing).catch(() => setOutgoing([]));
  }, [activeId, canManage]);

  useEffect(loadOutgoing, [loadOutgoing]);

  // Opening Settings is a natural moment to check for new invites.
  useEffect(() => {
    if (isOnline) refreshInvites().catch(() => {});
  }, [isOnline, refreshInvites]);

  if (!user || !bistro) return null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveName = () =>
    act(async () => {
      await renameBistro(bistro.id, nameInput ?? '');
      setNameInput(null);
    });

  const ownerName = bistro.members[bistro.ownerUid]?.name ?? 'someone';
  const otherBistros = Object.values(bistros).filter((b) => b.id !== bistro.id);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        {nameInput !== null ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Bistro name"
                value={nameInput}
                maxLength={60}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && nameInput.trim()) saveName(); }}
                autoFocus
              />
            </div>
            <Button size="sm" onClick={saveName} disabled={busy || !nameInput.trim()} aria-label="Save name">
              <Check size={14} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNameInput(null)} aria-label="Cancel">
              <X size={14} />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{bistro.name}</h3>
            {canManage && (
              <button
                onClick={() => setNameInput(bistro.name)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Rename bistro"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500 mt-1">
          {isOwnBistro
            ? 'Your bistro. Everyone you invite shares its recipes, meal plan, shopping list and store cupboard.'
            : `You're a member of ${ownerName}'s bistro. Your own bistro is unchanged — switch back any time from the profile menu.`}
        </p>
      </div>

      {!bistroMigrated && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
          Sharing will be available once your bistro has finished setting up.
        </p>
      )}
      {bistroMigrated && !isOnline && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
          You're offline — go online to manage members.
        </p>
      )}

      <BistroMemberList
        bistro={bistro}
        outgoing={outgoing}
        onRevoked={(id) => setOutgoing((list) => list.filter((i) => i.id !== id))}
        canManage={canManage}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      {canManage && (
        <Button variant="secondary" fullWidth onClick={() => setInviteOpen(true)}>
          <UserPlus size={14} /> Invite someone
        </Button>
      )}

      {!isOwnBistro && canManage && (confirmLeave ? (
        <div className="flex flex-col gap-2 bg-red-50 rounded-xl p-3">
          <p className="text-xs text-slate-700">
            Leave <strong>{bistro.name}</strong>? You'll lose access to its recipes and lists
            until someone invites you again.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={() => act(() => leaveBistro(bistro.id))}>
              {busy ? 'Leaving…' : 'Leave bistro'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="danger" fullWidth onClick={() => setConfirmLeave(true)}>
          Leave bistro
        </Button>
      ))}

      {otherBistros.length > 0 && (
        <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Your other bistros</p>
          {otherBistros.map((b) => (
            <div key={b.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 truncate">{b.name}</p>
                <p className="text-xs text-slate-400">
                  {b.memberUids.length} member{b.memberUids.length === 1 ? '' : 's'}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => switchBistro(b.id)}>
                Open
              </Button>
            </div>
          ))}
        </div>
      )}

      {inviteOpen && (
        <InviteMemberModal
          bistroId={bistro.id}
          bistroName={bistro.name}
          onClose={() => setInviteOpen(false)}
          onSent={loadOutgoing}
        />
      )}
    </Card>
  );
}
