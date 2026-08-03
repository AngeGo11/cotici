import type { ReactNode } from 'react';
import type { AdminTransaction, TransactionStatus } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
import { Badge, Button, Copyable, Modal, Money, StatusPill } from '@/components/ui';
import { useTransactionDetail } from '../api/transactions';

/** Cibles de forcage acceptees par le back-office, avec leur libelle bouton. */
const FORCE_TARGETS: { status: TransactionStatus; label: string }[] = [
  { status: 'RÉUSSIE', label: 'Marquer reussie' },
  { status: 'ÉCHOUÉE', label: 'Marquer echouee' },
  { status: 'ANNULÉE', label: 'Annuler la transaction' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="text-[13px] text-slate-800">{children ?? '—'}</div>
    </div>
  );
}

/** Ordre EN ATTENTE -> statut terminal accepte par le back-office. */
const FORCEABLE_SOURCE_STATUS = 'EN ATTENTE';

export function TransactionDetailModal({
  transaction,
  onClose,
  onForceStatus,
}: {
  transaction: AdminTransaction | null;
  onClose: () => void;
  /** Ouvre la boite de motif pour forcer la transaction vers `targetStatus`. */
  onForceStatus: (transaction: AdminTransaction, targetStatus: TransactionStatus) => void;
}) {
  const { data: detail, isLoading } = useTransactionDetail(transaction?.id ?? null);
  const canForce = transaction?.statut_transaction === FORCEABLE_SOURCE_STATUS;

  return (
    <Modal
      open={transaction !== null}
      onClose={onClose}
      title="Detail de la transaction"
      description={transaction ? `Reference ${transaction.ref_transaction}` : undefined}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {transaction && canForce && (
              <IfPermission permissions={[PERMISSIONS.TX_FORCE_STATUS]}>
                {FORCE_TARGETS.map((target) => (
                  <Button
                    key={target.status}
                    size="sm"
                    variant="danger"
                    onClick={() => onForceStatus(transaction, target.status)}
                  >
                    {target.label}
                  </Button>
                ))}
              </IfPermission>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      }
    >
      {transaction && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reference">
              <Copyable value={transaction.ref_transaction} />
            </Field>
            <Field label="Cle d'idempotence (client_ref)">
              <Copyable value={transaction.client_ref} />
            </Field>
            <Field label="Statut">
              <StatusPill
                status={transaction.statut_transaction}
                label={transaction.statut_transaction_display}
              />
            </Field>
            <Field label="Horodatage">{formatDateTime(transaction.date_transaction)}</Field>
            <Field label="Type">
              <Badge tone="brand">{transaction.type_transaction_display}</Badge>
            </Field>
            <Field label="Mode de paiement">
              <Badge tone="neutral">{transaction.mode_de_paiement_display}</Badge>
            </Field>
            <Field label="Montant">
              <Money value={transaction.montant_transaction} />
            </Field>
            <Field label="Solde apres transaction">
              <Money value={transaction.solde_courant} />
            </Field>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="field-label">Titulaire</p>
            <p className="text-[13px] font-medium text-slate-900">
              {[transaction.titulaire.first_name, transaction.titulaire.last_name]
                .filter(Boolean)
                .join(' ') || transaction.titulaire.username}
            </p>
            <p className="font-mono text-xxs text-slate-500">
              {transaction.titulaire.numero_telephone_masque} · wallet #{transaction.wallet}
            </p>
          </div>

          {!isLoading && detail && (detail.tontine || detail.tour || detail.epargne) && (
            <Field label="Rattachement">
              <div className="flex flex-wrap gap-1.5">
                {detail.tontine && <Badge tone="info">Tontine #{detail.tontine}</Badge>}
                {detail.tour && <Badge tone="info">Tour #{detail.tour}</Badge>}
                {detail.epargne && <Badge tone="info">Epargne #{detail.epargne}</Badge>}
              </div>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
