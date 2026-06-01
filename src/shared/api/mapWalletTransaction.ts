import type { WalletTransaction } from './walletApi';
import type { ActivityDetail } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  DÉPÔT: 'Dépôt',
  RETRAIT: 'Retrait',
  DÉBIT: 'Cotisation',
  VERSEMENT_EPARGNE_PERSONNELLE: 'Versement épargne',
  RETRAIT_EPARGNE_PERSONNELLE: 'Retrait épargne',
};

const STATUS_LABELS: Record<string, ActivityDetail['status']> = {
  RÉUSSIE: 'Complété',
  'EN ATTENTE': 'En cours',
  ANNULÉE: 'Annulé',
  ÉCHOUÉE: 'Annulé',
};

const METHOD_LABELS: Record<string, string> = {
  ORANGE: 'Orange Money',
  MTN: 'MTN MoMo',
  WAVE: 'Wave',
  MOOV: 'Moov',
  SOLDE_COTICI: 'Solde COTICI',
};

export function mapTransactionForUi(tx: WalletTransaction, index: number): ActivityDetail {
  const amount = Number(tx.montant_transaction);
  const isCredit = tx.type_transaction === 'DÉPÔT';
  const signedAmount = isCredit ? amount : -amount;
  const d = new Date(tx.date_transaction);

  return {
    id: tx.ref_transaction || String(index),
    type: TYPE_LABELS[tx.type_transaction] ?? tx.type_transaction,
    amount: signedAmount,
    date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    reference: tx.ref_transaction,
    status: STATUS_LABELS[tx.statut_transaction] ?? 'En cours',
    method: METHOD_LABELS[tx.mode_de_paiement] ?? tx.mode_de_paiement,
    accountHint: tx.numero_telephone || undefined,
  };
}

export function mapSavingsDepositForUi(tx: WalletTransaction, index: number): ActivityDetail {
  const amount = Number(tx.montant_transaction);
  const isWithdraw = tx.type_transaction === 'RETRAIT_EPARGNE_PERSONNELLE';
  const d = new Date(tx.date_transaction);

  return {
    id: tx.ref_transaction || String(index),
    type: TYPE_LABELS[tx.type_transaction] ?? tx.type_transaction,
    amount: isWithdraw ? -amount : amount,
    date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    reference: tx.ref_transaction,
    status: STATUS_LABELS[tx.statut_transaction] ?? 'En cours',
    method: METHOD_LABELS[tx.mode_de_paiement] ?? tx.mode_de_paiement,
    accountHint: tx.numero_telephone || undefined,
    note: isWithdraw
      ? 'Montant transféré vers votre solde COTICI disponible.'
      : 'Versement effectué depuis votre solde COTICI vers cet objectif.',
  };
}
