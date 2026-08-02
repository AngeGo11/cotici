import { Wallet as WalletIcon } from 'lucide-react';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
import { formatDateTime, formatFullName } from '@/lib/format';
import {
  Button,
  Copyable,
  EmptyState,
  Modal,
  Money,
  SkeletonText,
  StatusPill,
} from '@/components/ui';
import { useWalletDetail } from '../api/wallets';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="text-[13px] text-slate-800">{children ?? '—'}</div>
    </div>
  );
}

/** Correspondance statut de transaction (backend) -> apparence du badge. */
const TX_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  'RÉUSSIE': 'success',
  'EN ATTENTE': 'warning',
  'ÉCHOUÉE': 'danger',
  'ANNULÉE': 'neutral',
};

const TX_TYPE_LABELS: Record<string, string> = {
  'DÉPÔT': 'Depot',
  RETRAIT: 'Retrait',
  'DÉBIT': 'Debit',
  VERSEMENT_EPARGNE_PERSONNELLE: 'Versement epargne',
  RETRAIT_EPARGNE_PERSONNELLE: 'Retrait epargne',
  CONTRIBUTION_SOLIDAIRE: 'Contribution solidaire',
  VERSEMENT_SOLIDAIRE: 'Versement solidaire',
  VALIDATION_VERSEMENT_SOLIDAIRE: 'Validation versement solidaire',
  CONTRIBUTION_CAGNOTTE: 'Contribution cagnotte',
  VERSEMENT_CAGNOTTE: 'Versement cagnotte',
  PENALITE: 'Penalite',
  VERSEMENT_PENALITE: 'Versement penalite',
};

export function WalletDetailModal({
  walletId,
  onClose,
  onAdjust,
}: {
  walletId: number | null;
  onClose: () => void;
  onAdjust: () => void;
}) {
  const { data: wallet, isLoading, isError } = useWalletDetail(walletId);

  return (
    <Modal
      open={walletId !== null}
      onClose={onClose}
      title="Portefeuille"
      description={wallet ? `#${wallet.id} — ${formatFullName(wallet)}` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {wallet && (
            <IfPermission permissions={[PERMISSIONS.WALLET_ADJUST]}>
              <Button variant="primary" onClick={onAdjust}>
                Ajuster le solde
              </Button>
            </IfPermission>
          )}
        </>
      }
    >
      {isLoading && <SkeletonText lines={6} />}

      {isError && (
        <EmptyState
          title="Chargement impossible"
          description="Impossible de recuperer ce portefeuille."
        />
      )}

      {wallet && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Titulaire">{formatFullName(wallet)}</Field>
            <Field label="Numero de telephone">{wallet.numero_telephone_masque}</Field>
            <Field label="Identifiant (compte)">
              <span className="font-mono text-xxs">{wallet.username}</span>
            </Field>
            <Field label="Compte cree le">{formatDateTime(wallet.created_at)}</Field>
            <Field label="Solde courant">
              <Money value={wallet.solde_courant} className="text-[15px]" />
            </Field>
            <Field label="Nombre de transactions">{wallet.transactions_count}</Field>
          </div>

          <div>
            <p className="field-label mb-1.5">Dernieres transactions</p>
            {wallet.recent_transactions.length === 0 ? (
              <EmptyState
                icon={<WalletIcon className="h-6 w-6" aria-hidden />}
                title="Aucune transaction"
                description="Ce portefeuille n’a encore aucun mouvement."
              />
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Montant</th>
                      <th>Solde apres</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallet.recent_transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="whitespace-nowrap tabular text-slate-600">
                          {formatDateTime(tx.date_transaction)}
                        </td>
                        <td>{TX_TYPE_LABELS[tx.type_transaction] ?? tx.type_transaction}</td>
                        <td>
                          <Copyable value={tx.ref_transaction} />
                        </td>
                        <td>
                          <Money value={tx.montant_transaction} />
                        </td>
                        <td>
                          <Money value={tx.solde_courant} />
                        </td>
                        <td>
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
