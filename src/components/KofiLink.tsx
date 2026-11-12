import type { ReactNode } from 'react';
import { Coffee } from 'lucide-react';
import { KOFI_URL } from '../lib/tips';

interface Props {
  children: ReactNode;
  onClick?: () => void;
}

/** Outbound link to the Ko-fi page, styled as a small primary button. */
export function KofiLink({ children, onClick }: Props) {
  return (
    <a
      href={KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold rounded-[20px] bg-amber-500 text-slate-900 hover:bg-amber-400 active:bg-amber-600 shadow-sm transition-all duration-150"
    >
      <Coffee size={15} />
      {children}
    </a>
  );
}
