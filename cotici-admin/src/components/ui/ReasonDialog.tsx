import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Textarea } from './Input';

const MIN_REASON_LENGTH = 10;

export interface ReasonDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Le motif est transmis au backend et archive dans le journal d'audit. */
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/**
 * Boite de dialogue exigeant un motif ecrit avant toute action sensible
 * (suspension, ajustement de solde, forcage de statut). Le motif est
 * obligatoire cote serveur egalement : cette validation n'est qu'un confort.
 */
export function ReasonDialog({
  open,
  title,
  message,
  confirmLabel = 'Valider',
  destructive = true,
  loading = false,
  onConfirm,
  onClose,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const isValid = trimmed.length >= MIN_REASON_LENGTH;
  const error =
    touched && !isValid
      ? `Le motif doit contenir au moins ${MIN_REASON_LENGTH} caracteres.`
      : undefined;

  const handleConfirm = () => {
    setTouched(true);
    if (!isValid) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
            disabled={!isValid}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {message && <div className="text-[13px] text-slate-600">{message}</div>}

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xxs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>
            Cette action est irreversible et sera enregistree dans le journal d’audit avec votre
            identifiant, l’horodatage et le motif saisi.
          </p>
        </div>

        <Textarea
          label="Motif (obligatoire)"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
          error={error}
          hint={error ? undefined : `${trimmed.length} caractere(s) saisi(s).`}
          placeholder="Decrivez precisement la raison de cette intervention."
        />
      </div>
    </Modal>
  );
}
