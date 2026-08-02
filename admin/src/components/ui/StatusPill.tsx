import { Badge, type BadgeTone } from './Badge';
import { cn } from './cn';

/** Correspondance statut backend -> apparence et libelle francais. */
const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  // Transactions
  pending: { label: 'En attente', tone: 'warning' },
  processing: { label: 'En cours', tone: 'info' },
  completed: { label: 'Terminee', tone: 'success' },
  success: { label: 'Reussie', tone: 'success' },
  failed: { label: 'Echouee', tone: 'danger' },
  cancelled: { label: 'Annulee', tone: 'neutral' },
  reversed: { label: 'Contrepassee', tone: 'danger' },

  // Comptes et KYC
  active: { label: 'Actif', tone: 'success' },
  inactive: { label: 'Inactif', tone: 'neutral' },
  suspended: { label: 'Suspendu', tone: 'danger' },
  verified: { label: 'Verifie', tone: 'success' },
  unverified: { label: 'Non verifie', tone: 'neutral' },
  approved: { label: 'Approuve', tone: 'success' },
  rejected: { label: 'Rejete', tone: 'danger' },
  under_review: { label: 'En examen', tone: 'info' },

  // Produits d'epargne / tontines
  open: { label: 'Ouverte', tone: 'info' },
  running: { label: 'En cours', tone: 'brand' },
  closed: { label: 'Cloturee', tone: 'neutral' },
  draft: { label: 'Brouillon', tone: 'neutral' },
  resolved: { label: 'Resolu', tone: 'success' },
};

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400',
  brand: 'bg-brand',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
};

export function StatusPill({
  status,
  label,
  tone,
}: {
  status: string | null | undefined;
  /** Force le libelle affiche. */
  label?: string;
  /** Force l'apparence. */
  tone?: BadgeTone;
}) {
  const key = (status ?? '').toLowerCase();
  const mapped = STATUS_MAP[key];
  const resolvedTone = tone ?? mapped?.tone ?? 'neutral';
  const resolvedLabel = label ?? mapped?.label ?? status ?? '—';

  return (
    <Badge tone={resolvedTone}>
      <span className={cn('mr-1 h-1.5 w-1.5 rounded-full', DOTS[resolvedTone])} aria-hidden />
      {resolvedLabel}
    </Badge>
  );
}
