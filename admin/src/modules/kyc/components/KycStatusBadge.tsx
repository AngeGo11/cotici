import type { KycStatut } from '@/lib/api/types';
import { StatusPill } from '@/components/ui';

/**
 * `StatusPill` indexe ses libelles sur des cles anglaises ; les statuts KYC
 * sont des constantes francaises du domaine. On force donc explicitement le
 * libelle et le ton plutot que d'ajouter des alias dans la table commune.
 */
const KYC_STATUS: Record<KycStatut, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }> = {
  EN_ATTENTE: { label: 'En attente', tone: 'warning' },
  EN_EXAMEN: { label: 'En examen', tone: 'info' },
  APPROUVE: { label: 'Approuve', tone: 'success' },
  REJETE: { label: 'Rejete', tone: 'danger' },
};

export function KycStatusBadge({ statut }: { statut: KycStatut }) {
  const entry = KYC_STATUS[statut];
  return <StatusPill status={statut} label={entry?.label} tone={entry?.tone} />;
}
