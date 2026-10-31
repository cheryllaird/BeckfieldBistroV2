import { useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { ReauthCancelled } from '../../lib/account';

const CONFIRM_WORD = 'DELETE';

export function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const user = useStore((s) => s.user);
  const ownBistro = useStore((s) => (s.user ? s.bistros[s.user.uid] : undefined));
  const joined = useStore((s) =>
    Object.values(s.bistros).filter((b) => b.id !== s.user?.uid).length,
  );
  const deleteAccount = useStore((s) => s.deleteAccount);

  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const otherMembers = ownBistro ? ownBistro.memberUids.filter((m) => m !== user?.uid).length : 0;
  const confirmed = confirm.trim().toUpperCase() === CONFIRM_WORD;

  const handleDelete = async () => {
    setError('');
    setWorking(true);
    try {
      await deleteAccount(); // reloads the app on success
    } catch (e) {
      if (!(e instanceof ReauthCancelled)) {
        setError(e instanceof Error ? e.message : "Your account wasn't deleted. Check your connection and try again.");
      }
      setWorking(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={working ? undefined : onClose} />
        <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl flex flex-col gap-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Delete your account?</h3>
            <button onClick={onClose} disabled={working} className="text-slate-400 hover:text-slate-600" aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <ul className="text-xs text-slate-600 list-disc pl-4 flex flex-col gap-1">
            <li>
              <strong>{ownBistro?.name ?? 'Your bistro'}</strong> and everything in it will be deleted:
              recipes, meal plan, shopping list and store cupboard.
            </li>
            {otherMembers > 0 && (
              <li>
                {otherMembers === 1 ? 'The other member' : `The ${otherMembers} other members`} of your
                bistro will lose access to it.
              </li>
            )}
            {joined > 0 && (
              <li>
                You'll leave {joined === 1 ? 'the other bistro' : `the ${joined} other bistros`} you're in.
                Recipes you added there stay for their members.
              </li>
            )}
            <li>Your saved Gemini API key, and any shares and invites you sent or received, will be deleted.</li>
          </ul>
          <p className="text-xs text-slate-600">
            This can't be undone. You'll be asked to sign in with Google again to confirm.
          </p>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600" htmlFor="delete-confirm">
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              autoComplete="off"
              autoCapitalize="characters"
              disabled={working}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          <div className="flex gap-2 mt-1">
            <Button type="button" variant="secondary" fullWidth onClick={onClose} disabled={working}>
              Cancel
            </Button>
            <Button type="button" variant="danger" fullWidth onClick={handleDelete} disabled={!confirmed || working}>
              <Trash2 size={14} /> {working ? 'Deleting…' : 'Delete account'}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
