import { Coffee } from 'lucide-react';
import { useStore } from '../store';
import { Button } from './ui/Button';

interface Props {
  /** Runs before the panel opens, e.g. to dismiss the card holding the button. */
  onClick?: () => void;
}

/** Opens the in-app Ko-fi donation panel (SupportPanelModal). */
export function BuyCoffeeButton({ onClick }: Props) {
  const openSupportPanel = useStore((s) => s.openSupportPanel);
  return (
    <Button
      className="min-h-11"
      onClick={() => {
        onClick?.();
        openSupportPanel();
      }}
    >
      <Coffee size={15} />
      Buy me a coffee
    </Button>
  );
}
