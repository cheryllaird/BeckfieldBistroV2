import type { InputHTMLAttributes, ReactNode } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
}

export function Input({ label, error, icon, hint, className = '', ...props }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        )}
        <input
          {...props}
          className={[
            'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400',
            'transition-colors outline-none',
            'focus:border-amber-400 focus:ring-2 focus:ring-amber-100',
            error ? 'border-red-300' : 'border-slate-200',
            icon ? 'pl-9' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
