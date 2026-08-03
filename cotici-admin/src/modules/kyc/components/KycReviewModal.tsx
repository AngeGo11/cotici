import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { KycNiveau, KycSubmission } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
import {
  Badge,
  Button,
  Modal,
  ReasonDialog,
  Select,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  useApproveKyc,
  useKycDetail,
  useRejectKyc,
  useTakeKycInReview,
} from '../api/kyc';
import { KycStatusBadge } from './KycStatusBadge';

const PIECE_LABELS: Record<string, string> = {
  recto: 'Piece — recto',
  verso: 'Piece — verso',
  selfie: 'Photo du porteur',
};

const NIVEAU_OPTIONS = [
  { value: '', label: 'Niveau demande par le client' },
  { value: 'NIVEAU_1', label: 'Niveau 1 — identite declaree' },
  { value: 'NIVEAU_2', label: 'Niveau 2 — piece officielle verifiee' },
  { value: 'NIVEAU_3', label: 'Niveau 3 — verification renforcee' },
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="text-[13px] text-slate-800">{value || '—'}</p>
    </div>
  );
}

/**
 * Ecran d'examen d'un dossier.
 *
 * Les pieces sont affichees depuis l'endpoint authentifie du back-office :
 * aucune URL publique n'existe pour ces fichiers, et chaque affichage est
 * journalise cote serveur.
 */
export function KycReviewModal({
  submission,
  onClose,
}: {
  submission: KycSubmission | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data, isLoading } = useKycDetail(submission?.id ?? null);
  const approve = useApproveKyc();
  const reject = useRejectKyc();
  const takeInReview = useTakeKycInReview();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [niveau, setNiveau] = useState<KycNiveau | ''>('');

  // Ouvrir un dossier signale aux autres operateurs qu'il est pris en charge.
  useEffect(() => {
    setDecision(null);
    setNiveau('');
    if (submission && submission.statut === 'EN_ATTENTE') {
      takeInReview.mutate({ id: submission.id });
    }
    // `takeInReview` est stable (react-query) mais non memoise : l'exclure
    // evite de re-signaler la prise en charge a chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.id]);

  if (!submission) return null;

  const detail = data;
  const dejaDecide = submission.statut === 'APPROUVE' || submission.statut === 'REJETE';

  const handleDecision = async (reason: string) => {
    try {
      if (decision === 'approve') {
        await approve.mutateAsync({ id: submission.id, reason, niveau });
        toast.success('Dossier approuve', submission.nom_complet_declare);
      } else {
        await reject.mutateAsync({ id: submission.id, reason });
        toast.success('Dossier rejete', 'Le motif sera transmis au client.');
      }
      setDecision(null);
      onClose();
    } catch (caught) {
      toast.error('Decision refusee', errorMessage(caught));
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={submission.nom_complet_declare || submission.client_username}
        description={
          <span className="font-mono text-xxs text-slate-500">
            {submission.client_username}
          </span>
        }
        footer={
          dejaDecide ? (
            <p className="text-xxs text-slate-500">
              Dossier deja decide : une decision est definitive. Le client doit
              soumettre un nouveau dossier.
            </p>
          ) : (
            <IfPermission permissions={[PERMISSIONS.KYC_APPROVE]}>
              <div className="flex items-center justify-end gap-2">
                <div className="w-64">
                  <Select
                    options={NIVEAU_OPTIONS}
                    value={niveau}
                    onChange={(event) => setNiveau(event.target.value as KycNiveau | '')}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDecision('reject')}
                  icon={<X className="h-3.5 w-3.5" aria-hidden />}
                >
                  Rejeter
                </Button>
                <Button
                  size="sm"
                  onClick={() => setDecision('approve')}
                  icon={<Check className="h-3.5 w-3.5" aria-hidden />}
                >
                  Approuver
                </Button>
              </div>
            </IfPermission>
          )
        }
      >
        {isLoading || !detail ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Field label="Statut" value={<KycStatusBadge statut={detail.statut} />} />
              <Field label="Niveau demande" value={detail.niveau_demande} />
              <Field
                label="Niveau accorde"
                value={detail.niveau_accorde || '—'}
              />
              <Field label="Type de piece" value={detail.type_piece} />
              <Field
                label="Numero de piece"
                value={<span className="font-mono text-xxs">{detail.numero_piece}</span>}
              />
              <Field
                label="Expiration"
                value={formatDate(detail.date_expiration_piece)}
              />
              <Field
                label="Telephone"
                value={<span className="tabular">{detail.client_telephone_masque}</span>}
              />
              <Field label="Naissance" value={formatDate(detail.date_naissance)} />
              <Field
                label="Soumission"
                value={formatDateTime(detail.date_soumission)}
              />
              {detail.motif_decision && (
                <div className="col-span-2 md:col-span-3">
                  <p className="field-label">Motif de la decision</p>
                  <p className="text-[13px] text-slate-800">{detail.motif_decision}</p>
                </div>
              )}
            </div>

            <div>
              <p className="field-label">Pieces justificatives</p>
              {detail.pieces_disponibles.length === 0 ? (
                <p className="text-xxs text-slate-500">Aucune piece fournie.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {detail.pieces_disponibles.map((piece) => (
                    <figure key={piece} className="overflow-hidden rounded-md border border-slate-200">
                      <img
                        src={endpoints.kyc.document(detail.id, piece)}
                        alt={PIECE_LABELS[piece] ?? piece}
                        className="h-36 w-full bg-slate-50 object-contain"
                      />
                      <figcaption className="border-t border-slate-100 px-2 py-1 text-xxs text-slate-500">
                        {PIECE_LABELS[piece] ?? piece}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xxs text-slate-400">
                Chaque consultation d’une piece est journalisee.
              </p>
            </div>

            {detail.decide_par_username && (
              <Badge tone="neutral">
                Decide par {detail.decide_par_username} le{' '}
                {formatDateTime(detail.date_decision)}
              </Badge>
            )}
          </div>
        )}
      </Modal>

      <ReasonDialog
        open={decision !== null}
        title={decision === 'approve' ? 'Approuver le dossier' : 'Rejeter le dossier'}
        message={
          <p>
            {decision === 'approve'
              ? 'La decision est definitive et sera journalisee nominativement.'
              : 'Le motif saisi sera transmis au client : il doit lui etre comprehensible.'}
          </p>
        }
        confirmLabel={decision === 'approve' ? 'Approuver' : 'Rejeter'}
        destructive={decision === 'reject'}
        loading={approve.isPending || reject.isPending}
        onConfirm={(reason) => void handleDecision(reason)}
        onClose={() => setDecision(null)}
      />
    </>
  );
}
