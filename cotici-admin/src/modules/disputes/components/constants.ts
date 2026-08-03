import type { BadgeTone } from '@/components/ui';
import type { DisputeCategory, DisputeStatus } from '@/lib/api/types';

/** Libelles francais des categories de litige (valeurs figees cote backend). */
export const CATEGORY_LABELS: Record<DisputeCategory, string> = {
  transaction_contestee: 'Transaction contestee',
  cotisation_non_creditee: 'Cotisation non creditee',
  litige_entre_membres: 'Litige entre membres',
  autre: 'Autre',
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const STATUS_LABELS: Record<DisputeStatus, string> = {
  ouvert: 'Ouvert',
  en_cours_examen: 'En cours d’examen',
  resolu: 'Resolu',
  rejete: 'Rejete',
};

const STATUS_TONES: Record<DisputeStatus, BadgeTone> = {
  ouvert: 'warning',
  en_cours_examen: 'info',
  resolu: 'success',
  rejete: 'danger',
};

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** StatusPill n'a pas de correspondance francaise pour nos statuts (valeurs
 * backend en francais) : on force label/tone explicitement plutot que de
 * s'appuyer sur sa table de correspondance interne (anglophone). */
export function statusToneAndLabel(status: DisputeStatus): { label: string; tone: BadgeTone } {
  return { label: STATUS_LABELS[status], tone: STATUS_TONES[status] };
}
