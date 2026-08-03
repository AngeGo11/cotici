import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Retire le padding interne (utile pour un tableau pleine largeur). */
  flush?: boolean;
}

export function Card({
  title,
  description,
  actions,
  flush = false,
  className,
  children,
  ...props
}: CardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cn('rounded-lg border border-slate-200 bg-white shadow-panel', className)}
      {...props}
    >
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xxs text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && 'p-4')}>{children}</div>
    </section>
  );
}

export function CardStat({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'text-slate-900',
    positive: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  } as const;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xxs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className={cn('mt-2 text-xl font-semibold tabular', tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xxs text-slate-500">{hint}</p>}
    </div>
  );
}
