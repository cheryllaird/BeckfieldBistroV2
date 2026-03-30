import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  variant?: 'default' | 'amber' | 'slate' | 'green';
  size?: 'sm' | 'md';
}

const variantClasses: Record<NonNullable<Props['variant']>, string> = {
  default: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-100 text-amber-700',
  slate: 'bg-slate-800 text-white',
  green: 'bg-green-100 text-green-700',
};

const sizeClasses: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-xs px-2 py-0.5 rounded-md',
  md: 'text-sm px-2.5 py-1 rounded-lg',
};

export function Badge({ children, variant = 'default', size = 'sm' }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${variantClasses[variant]} ${sizeClasses[size]}`}>
      {children}
    </span>
  );
}
