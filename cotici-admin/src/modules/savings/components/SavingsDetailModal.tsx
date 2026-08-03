import type { ReactNode } from 'react';
import type { SavingsDetail, SavingsListItem } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/format';
import { Button, Modal, Money, Skeleton, StatusPill } from '@/components/ui';
import { useSavingsDetail } from '../api/savings';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="text-[13px] text-slate-800">{children ?? '—'}</div>
    </div>
  );
}

/** Correspondance statut de transaction (backend) -> apparence du badge —
 * meme table que `modules/wallets/components/WalletDetailModal.tsx`, le
 * back-office n'ayant qu'un seul vocabulaire de statuts de transaction. */
const TX_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  'RÉUSSIE': 'success',
  'EN ATTENTE': 'warning',
  'ÉCHOUÉE': 'danger',
  'ANNULÉE': 'neutral',
};

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="tabular text-xxs text-slate-600">{value.toFixed(1)} %</span>
    </div>
  );
}

export function SavingsDetailModal({
  epargne,
  onClose,
}: {
  epargne: SavingsListItem | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useSavingsDetail(epargne?.id ?? null);
  const detail: SavingsDetail | undefined = data;

  return (
    <Modal
      open={epargne !== null}
      onClose={onClose}
      title="Detail de l’epargne"
      description={epargne ? `${epargne.nom_projet} — #${epargne.id}` : undefined}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {detail && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Titulaire">
              <p className="font-medium text-slate-900">{detail.titulaire.nom_complet}</p>
              <p className="text-xxs text-slate-500">
                {detail.titulaire.numero_telephone_masque}
              </p>
            </Field>
            <Field label="Categorie">{detail.categorie ?? '—'}</Field>
            <Field label="Statut">
              <StatusPill status={detail.etat === 'ACTIF' ? 'active' : 'inactive'} label={detail.etat} />
            </Field>
            <Field label="Objectif atteint">
              {detail.objectif_atteint ? (
                <StatusPill status="verified" label="Oui" />
              ) : (
                <StatusPill status="unverified" label="Non" />
              )}
            </Field>
            <Field label="Objectif">
              <Money value={detail.objectif_cotisation} />
            </Field>
            <Field label="Cumul verse">
              <Money value={detail.cumul_verse} />
            </Field>
            <Field label="Solde courant (application)">
              <Money value={detail.montant_courant} />
            </Field>
            <Field label="Progression">
              <ProgressBar value={detail.progression} />
            </Field>
            <Field label="Date de creation">{formatDate(detail.date_creation)}</Field>
            <Field label="Echeance">
              {detail.echeance ? formatDate(detail.echeance) : 'Non definie'}
            </Field>
            {detail.date_archivage && (
              <Field label="Date d’archivage">{formatDateTime(detail.date_archivage)}</Field>
            )}
            {detail.date_suppression && (
              <Field label="Date de suppression">{formatDateTime(detail.date_suppression)}</Field>
            )}
          </div>

          <div>
            <p className="field-label mb-2">Historique des versements/retraits</p>
            {detail.historique.length === 0 ? (
              <p className="text-xxs text-slate-400">Aucun mouvement enregistre.</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-slate-200">
                <table className="w-full text-[13px]">
                  <thead className="bg-slate-50 text-xxs uppercase text-slate-500">
                    <tr>
                      <th className="px-2.5 py-1.5 text-left font-medium">Date</th>
                      <th className="px-2.5 py-1.5 text-left font-medium">Type</th>
                      <th className="px-2.5 py-1.5 text-right font-medium">Montant</th>
                      <th className="px-2.5 py-1.5 text-left font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.historique.map((tx) => (
                      <tr key={tx.id}>
                        <td className="whitespace-nowrap px-2.5 py-1.5 tabular text-slate-600">
                          {formatDateTime(tx.date_transaction)}
                        </td>
                        <td className="px-2.5 py-1.5 text-slate-700">
                          {tx.type_transaction === 'VERSEMENT_EPARGNE_PERSONNELLE'
                            ? 'Versement'
                            : 'Retrait'}
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          <Money value={tx.montant_transaction} />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <StatusPill
                            status={tx.statut_transaction}
                            tone={TX_STATUS_TONE[tx.statut_transaction] ?? 'neutral'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
