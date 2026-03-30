import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
}

export function Card({ children, className = '', onClick, padding = true }: Props) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-2xl border border-slate-100 shadow-sm',
        padding ? 'p-4' : '',
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow duration-200' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
