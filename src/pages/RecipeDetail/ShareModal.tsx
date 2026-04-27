import { useState } from 'react';
import { X, Send, Check } from 'lucide-react';
import type { Recipe } from '../../types';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';
import { ModalPortal } from '../../components/ui/ModalPortal';

interface Props {
  recipe: Recipe;
  onClose: () => void;
}

export function ShareModal({ recipe, onClose }: Props) {
  const user = useStore((s) => s.user);
  const sendRecipe = useStore((s) => s.sendRecipe);

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = (value: string): string => {
    if (!value.trim()) return 'Please enter an email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Please enter a valid email address.';
    if (value.trim().toLowerCase() === user?.email?.toLowerCase()) return "You can't share a recipe with yourself.";
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(email);
    if (err) { setError(err); return; }
    setError('');
    setSending(true);
    try {
      await sendRecipe(recipe, email.trim().toLowerCase());
      setSent(true);
    } catch {
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl flex flex-col animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-800">Share recipe</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Sharing: <strong>{recipe.title}</strong>
          </p>

          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check size={24} className="text-green-600" />
              </div>
              <p className="text-sm text-slate-700 text-center">
                Recipe sent to <strong>{email}</strong>.<br />
                They'll see it in their library when they sign in.
              </p>
              <Button fullWidth onClick={onClose}>Done</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600" htmlFor="share-email">
                  Recipient's email address
                </label>
                <input
                  id="share-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="friend@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  autoFocus
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>

              <div className="flex gap-2 mt-1">
                <Button type="button" variant="secondary" fullWidth onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" fullWidth disabled={sending}>
                  <Send size={14} /> {sending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
