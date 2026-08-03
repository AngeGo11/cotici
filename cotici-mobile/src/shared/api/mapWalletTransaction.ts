import type { WalletTransaction } from './walletApi';
import type { ActivityDetail } from '@/types';
import { resolveActivityTone } from './activityDisplay';

const TYPE_LABELS: Record<string, string> = {
  DÉPÔT: 'Dépôt',
  RETRAIT: 'Retrait',
  DÉBIT: 'Cotisation',
  VERSEMENT_EPARGNE_PERSONNELLE: 'Versement épargne',
  RETRAIT_EPARGNE_PERSONNELLE: 'Retrait épargne',
  VERSEMENT_SOLIDAIRE: 'Versement solidaire reçu',
  VALIDATION_VERSEMENT_SOLIDAIRE: 'Versement validé',
  CONTRIBUTION_SOLIDAIRE: 'Contribution solidaire',
  CONTRIBUTION_CAGNOTTE: 'Contribution cagnotte',
  VERSEMENT_CAGNOTTE: 'Versement cagnotte reçu',
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

function buildNote(tx: WalletTransaction, tone: ActivityDetail['tone']): string | undefined {
  if (tx.type_transaction === 'VERSEMENT_SOLIDAIRE') {
    return 'Montant de la collecte crédité sur votre solde Cotici.';
  }
  if (tx.type_transaction === 'VALIDATION_VERSEMENT_SOLIDAIRE') {
    const beneficiaire = tx.beneficiaire_nom?.trim();
    const motif = tx.motif_collecte?.trim();
    const cible = beneficiaire ? `vers ${beneficiaire}` : 'au bénéficiaire';
    let note = `Versement validé ${cible}.`;
    if (motif) {
      note += ` Collecte : ${motif}.`;
    }
    return note;
  }
  if (tx.type_transaction === 'CONTRIBUTION_SOLIDAIRE' && tx.motif_collecte?.trim()) {
    return `Participation à la collecte : ${tx.motif_collecte.trim()}.`;
  }
  if (tone === 'neutral') {
    return undefined;
  }
  return undefined;
}

export function mapTransactionForUi(tx: WalletTransaction, index: number): ActivityDetail {
  const amount = Number(tx.montant_transaction);
  const tone = resolveActivityTone(tx.type_transaction);
  const signedAmount = tone === 'credit' ? amount : tone === 'debit' ? -amount : amount;
  const d = new Date(tx.date_transaction);

  return {
    id: tx.ref_transaction || String(index),
    type: TYPE_LABELS[tx.type_transaction] ?? tx.type_transaction,
    amount: signedAmount,
    tone,
    date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    reference: tx.ref_transaction,
    status: STATUS_LABELS[tx.statut_transaction] ?? 'En cours',
    method: METHOD_LABELS[tx.mode_de_paiement] ?? tx.mode_de_paiement,
    accountHint: tx.numero_telephone || undefined,
    note: buildNote(tx, tone),
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
    tone: isWithdraw ? 'debit' : 'credit',
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
