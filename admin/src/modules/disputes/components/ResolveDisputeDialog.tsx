import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button, Modal, Textarea, cn } from '@/components/ui';
import type { Dispute, DisputeResolutionOutcome } from '@/lib/api/types';

const MIN_LENGTH = 10;

export interface ResolveDisputeDialogProps {
  dispute: Dispute | null;
  loading?: boolean;
  onConfirm: (payload: { resolution: DisputeResolutionOutcome; decision: string; reason: string }) => void;
  onClose: () => void;
}

/**
 * Boite de dialogue de resolution d'un litige.
 *
 * Deux champs texte distincts sont exiges (voir
 * `DisputeResolveSerializer` cote backend) : `decision` documente le verdict
 * rendu (ce que le staff communique/consigne sur le dossier), `reason` est
 * le motif exige pour toute action sensible et alimente le journal d'audit.
 */
export function ResolveDisputeDialog({ dispute, loading = false, onConfirm, onClose }: ResolveDisputeDialogProps) {
  const [resolution, setResolution] = useState<DisputeResolutionOutcome>('resolu');
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (dispute) {
      setResolution('resolu');
      setDecision('');
      setReason('');
      setTouched(false);
    }
  }, [dispute]);

  const trimmedDecision = decision.trim();
  const trimmedReason = reason.trim();
  const isValid = trimmedDecision.length >= MIN_LENGTH && trimmedReason.length >= MIN_LENGTH;

  const handleConfirm = () => {
    setTouched(true);
    if (!isValid) return;
    onConfirm({ resolution, decision: trimmedDecision, reason: trimmedReason });
  };

  return (
    <Modal
      open={dispute !== null}
      onClose={onClose}
      title="Resoudre le litige"
      description={dispute ? dispute.subject : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            variant={resolution === 'rejete' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
            disabled={!isValid}
          >
            Confirmer la resolution
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setResolution('resolu')}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[13px] transition-colors',
              resolution === 'resolu'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Litige resolu
          </button>
          <button
            type="button"
            onClick={() => setResolution('rejete')}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[13px] transition-colors',
              resolution === 'rejete'
                ? 'border-red-400 bg-red-50 text-red-800'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            <XCircle className="h-4 w-4 shrink-0" aria-hidden />
            Litige rejete
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xxs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>
            Cette action cloture definitivement le litige et sera enregistree dans le journal
            d’audit. Rappel : la resolution ne declenche aucun mouvement de fonds — un
            remboursement eventuel se fait depuis le module Portefeuilles.
          </p>
        </div>

        <Textarea
          label="Decision (obligatoire)"
          rows={3}
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && trimmedDecision.length < MIN_LENGTH ? `Au moins ${MIN_LENGTH} caracteres.` : undefined}
          placeholder="Verdict rendu, consigne au dossier du litige."
        />

        <Textarea
          label="Motif (obligatoire)"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && trimmedReason.length < MIN_LENGTH ? `Au moins ${MIN_LENGTH} caracteres.` : undefined}
          hint="Justification de la decision, tracee dans le journal d’audit."
        />
      </div>
    </Modal>
  );
}
