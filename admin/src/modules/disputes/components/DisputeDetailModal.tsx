import { AlertOctagon, Users2 } from 'lucide-react';
import { Button, Modal, Money, StatusPill } from '@/components/ui';
import { IfPermission } from '@/auth/RequirePermission';
import { PERMISSIONS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';
import type { Dispute } from '@/lib/api/types';
import { useDispute } from '../api/disputes';
import { CATEGORY_LABELS, statusToneAndLabel } from './constants';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="text-[13px] text-slate-800">{children ?? '—'}</div>
    </div>
  );
}

export function DisputeDetailModal({
  dispute,
  onClose,
  onResolve,
}: {
  dispute: Dispute | null;
  onClose: () => void;
  onResolve: (dispute: Dispute) => void;
}) {
  const { data: detail, isLoading } = useDispute(dispute?.id ?? null);
  const canBeResolved = dispute ? dispute.status === 'ouvert' || dispute.status === 'en_cours_examen' : false;

  return (
    <Modal
      open={dispute !== null}
      onClose={onClose}
      title="Detail du litige"
      description={dispute ? `Litige #${dispute.id}` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {dispute && canBeResolved && (
            <IfPermission permissions={[PERMISSIONS.DISPUTE_RESOLVE]}>
              <Button variant="primary" onClick={() => onResolve(dispute)}>
                Resoudre le litige
              </Button>
            </IfPermission>
          )}
        </>
      }
    >
      {dispute && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statut">
              {(() => {
                const { label, tone } = statusToneAndLabel(dispute.status);
                return <StatusPill status={dispute.status} label={label} tone={tone} />;
              })()}
            </Field>
            <Field label="Categorie">{CATEGORY_LABELS[dispute.category]}</Field>
            <Field label="Ouvert par">
              {dispute.opened_by ? (
                <div className="leading-tight">
                  <p>{dispute.opened_by.username}</p>
                  <p className="font-mono text-xxs text-slate-500">
                    {dispute.opened_by.numero_telephone_masque}
                  </p>
                </div>
              ) : (
                <span className="text-slate-400">Compte supprime</span>
              )}
            </Field>
            <Field label="Date d’ouverture">{formatDateTime(dispute.opened_at)}</Field>
            {dispute.transaction && (
              <Field label="Transaction contestee">
                <div className="leading-tight">
                  <p className="font-mono text-xxs">{dispute.transaction.ref_transaction}</p>
                  <Money value={dispute.transaction.montant_transaction} />
                </div>
              </Field>
            )}
            {dispute.tontine && (
              <Field label="Tontine concernee">
                <span className="inline-flex items-center gap-1">
                  <Users2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                  {dispute.tontine.description}
                </span>
              </Field>
            )}
          </div>

          <Field label="Objet">{dispute.subject}</Field>

          {isLoading ? (
            <p className="text-xxs text-slate-400">Chargement du detail…</p>
          ) : detail ? (
            <>
              <Field label="Description">
                <p className="rounded-md border border-slate-200 bg-slate-50 p-2 whitespace-pre-wrap">
                  {detail.description}
                </p>
              </Field>

              {detail.status !== 'ouvert' && detail.status !== 'en_cours_examen' && (
                <>
                  <Field label="Decision">
                    <p className="rounded-md border border-slate-200 bg-slate-50 p-2 whitespace-pre-wrap">
                      {detail.decision || '—'}
                    </p>
                  </Field>
                  <Field label="Motif">
                    <p className="rounded-md border border-slate-200 bg-slate-50 p-2 whitespace-pre-wrap">
                      {detail.resolution_reason || '—'}
                    </p>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Resolu par">
                      {detail.resolved_by?.username ?? (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <AlertOctagon className="h-3.5 w-3.5" aria-hidden />—
                        </span>
                      )}
                    </Field>
                    <Field label="Date de resolution">{formatDateTime(detail.resolved_at)}</Field>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
