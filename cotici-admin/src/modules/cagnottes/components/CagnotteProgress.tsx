import { formatPercent } from '@/lib/format';
import { cn } from '@/components/ui';

/** Barre de progression vers l'objectif de collecte d'une cagnotte. */
export function CagnotteProgress({
  progression,
  objectifAtteint,
}: {
  /** Pourcentage (0-100), deja plafonne cote serveur. */
  progression: number;
  objectifAtteint: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, progression));

  return (
    <div className="w-32">
      <div className="flex items-center justify-between text-xxs text-slate-500">
        <span className={cn('font-medium', objectifAtteint && 'text-emerald-600')}>
          {formatPercent(clamped / 100)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', objectifAtteint ? 'bg-emerald-500' : 'bg-brand')}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
