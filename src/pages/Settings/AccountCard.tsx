import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DeleteAccountModal } from './DeleteAccountModal';

export function AccountCard() {
  const [deleting, setDeleting] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Account</h3>
        <p className="text-xs text-slate-500 mt-1">
          Deleting your account permanently removes your recipes, meal plans, shopping lists,
          store cupboard and saved API key. It can't be undone.
        </p>
      </div>
      <Button variant="danger" size="sm" className="w-fit" onClick={() => setDeleting(true)}>
        <Trash2 size={14} /> Delete account
      </Button>
      {deleting && <DeleteAccountModal onClose={() => setDeleting(false)} />}
    </Card>
  );
}
