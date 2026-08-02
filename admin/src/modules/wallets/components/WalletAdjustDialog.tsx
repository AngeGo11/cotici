import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { WalletSummary } from '@/lib/api/types';
import { formatFullName } from '@/lib/format';
import { Button, Input, Modal, Money, Textarea } from '@/components/ui';

const MIN_REASON_LENGTH = 10;

export interface WalletAdjustDialogProps {
  open: boolean;
  wallet: WalletSummary | null;
  loading?: boolean;
  onConfirm: (amount: number, reason: string) => void;
  onClose: () => void;
}

/**
 * Boite de dialogue d'ajustement manuel de solde : saisie d'un montant signe
 * (positif = credit, negatif = debit) et d'un motif obligatoire. Le
 * recalcul du solde resultant est purement indicatif : le backend est seul
 * juge et refuse toute operation qui rendrait le solde negatif.
 */
export function WalletAdjustDialog({
  open,
  wallet,
  loading = false,
  onConfirm,
  onClose,
}: WalletAdjustDialogProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const parsedAmount = amount.trim() === '' ? null : Number(amount);
  const amountValid = parsedAmount !== null && Number.isFinite(parsedAmount) && parsedAmount !== 0;
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= MIN_REASON_LENGTH;
  const isValid = amountValid && reasonValid;

  const currentBalance = wallet ? Number(wallet.solde_courant) || 0 : 0;
  const projectedBalance = useMemo(
    () => (amountValid && parsedAmount !== null ? currentBalance + parsedAmount : null),
    [amountValid, parsedAmount, currentBalance],
  );

  const amountError =
    touched && !amountValid ? 'Saisissez un montant non nul (positif ou negatif).' : undefined;
  const reasonError =
    touched && !reasonValid
      ? `Le motif doit contenir au moins ${MIN_REASON_LENGTH} caracteres.`
      : undefined;

  const handleConfirm = () => {
    setTouched(true);
    if (!isValid || parsedAmount === null) return;
    onConfirm(parsedAmount, trimmedReason);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajuster le solde"
      description={wallet ? `Portefeuille de ${formatFullName(wallet)}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={loading} disabled={!isValid}>
            Valider l’ajustement
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xxs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <p>
            Ecriture financiere irreversible : elle sera journalisee avec votre identifiant,
            l’horodatage et le motif saisi. Un ajustement qui rendrait le solde negatif est
            automatiquement refuse.
          </p>
        </div>

        <Input
          label="Montant de l’ajustement (F CFA)"
          placeholder="Ex. 5000 (credit) ou -2000 (debit)"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onBlur={() => setTouched(true)}
          error={amountError}
          hint={
            !amountError
              ? 'Positif pour crediter, negatif pour debiter le portefeuille.'
              : undefined
          }
        />

        {wallet && (
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xxs text-slate-600">
            <span>Solde actuel</span>
            <Money value={wallet.solde_courant} />
          </div>
        )}

        {projectedBalance !== null && (
          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xxs text-slate-600">
            <span>Solde resultant estime</span>
            <Money value={projectedBalance} signed />
          </div>
        )}

        <Textarea
          label="Motif (obligatoire)"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
          error={reasonError}
          hint={reasonError ? undefined : `${trimmedReason.length} caractere(s) saisi(s).`}
          placeholder="Decrivez precisement la raison de cet ajustement (incident, compensation, correction...)."
        />
      </div>
    </Modal>
  );
}
