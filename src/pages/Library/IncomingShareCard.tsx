import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';
import type { SharedRecipe } from '../../types';
import { useStore } from '../../store';
import { Button } from '../../components/ui/Button';

interface Props {
  share: SharedRecipe;
}

export function IncomingShareCard({ share }: Props) {
  const navigate = useNavigate();
  const acceptShare = useStore((s) => s.acceptShare);
  const dismissShare = useStore((s) => s.dismissShare);
  const [accepting, setAccepting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const newId = await acceptShare(share);
      if (newId) navigate(`/recipes/${newId}`);
    } catch {
      setAccepting(false);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await dismissShare(share.id);
    } catch {
      setDismissing(false);
    }
  };

  return (
    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
      {/* Recipe thumbnail */}
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
        {share.recipe.coverImage && !imgError ? (
          <img
            src={share.recipe.coverImage}
            alt={share.recipe.title}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <UtensilsCrossed size={20} className="text-slate-300" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{share.recipe.title}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          From <span className="font-medium text-slate-600">{share.fromName}</span>
        </p>

        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={handleAccept} disabled={accepting || dismissing}>
            {accepting ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} disabled={accepting || dismissing}>
            {dismissing ? '…' : 'Dismiss'}
          </Button>
        </div>
      </div>
    </div>
  );
}
