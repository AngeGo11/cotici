import { formatAmount, toNumber } from '@/lib/format';
import { cn } from './cn';

export function Money({
  value,
  signed = false,
  className,
}: {
  value: number | string | null | undefined;
  /** Colore et prefixe la valeur selon son signe (mouvements de ledger). */
  signed?: boolean;
  className?: string;
}) {
  const amount = toNumber(value);
  const tone =
    signed && amount !== null
      ? amount > 0
        ? 'text-emerald-600'
        : amount < 0
          ? 'text-red-600'
          : 'text-slate-600'
      : 'text-slate-900';

  const prefix = signed && amount !== null && amount > 0 ? '+' : '';

  return (
    <span className={cn('tabular font-medium', tone, className)}>
      {prefix}
      {formatAmount(amount)}
    </span>
  );
}
