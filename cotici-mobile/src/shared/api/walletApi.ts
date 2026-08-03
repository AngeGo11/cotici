import type { PaymentProvider } from '@/types';
import { requestWithAuth } from './authFetch';

/**
 * Statuts possibles renvoyés par le backend pour une transaction wallet.
 * Valeurs exactes avec accents — ne pas normaliser côté client.
 */
export type WalletTransactionStatus = 'EN ATTENTE' | 'RÉUSSIE' | 'ÉCHOUÉE' | 'ANNULÉE';

/**
 * En mode sandbox (dev), le dépôt est crédité immédiatement : `ancien_solde` et
 * `nouveau_solde` sont renvoyés, `sandbox: true`.
 * En mode CinetPay réel (prod), le wallet n'est PAS encore crédité : le backend
 * renvoie `payment_url` (à ouvrir) et `statut_transaction: "EN ATTENTE"`, sans
 * `ancien_solde`/`nouveau_solde`.
 */
export type DepositResponse = {
  numero_telephone_utilise: string;
  montant_depot: string;
  ref_transaction: string;
  ancien_solde?: string;
  nouveau_solde?: string;
  payment_url?: string;
  statut_transaction?: WalletTransactionStatus;
  sandbox?: boolean;
  idempotent_replay?: boolean;
};

/**
 * En mode sandbox (dev), le retrait débite et confirme immédiatement.
 * En mode CinetPay réel (prod), le wallet est déjà débité (`nouveau_solde` présent)
 * mais le transfert Mobile Money est encore en cours : `statut_transaction: "EN ATTENTE"`.
 * Il peut échouer plus tard, auquel cas le backend recrédite automatiquement.
 */
export type WithdrawalResponse = {
  numero_telephone_utilise: string;
  montant_retire: string;
  ref_transaction: string;
  ancien_solde?: string;
  nouveau_solde?: string;
  statut_transaction?: WalletTransactionStatus;
  sandbox?: boolean;
  idempotent_replay?: boolean;
};

export type WalletTransaction = {
  ref_transaction: string;
  montant_transaction: string;
  numero_telephone?: string;
  type_transaction: string;
  statut_transaction: string;
  mode_de_paiement: string;
  date_transaction: string;
  motif_collecte?: string;
  beneficiaire_nom?: string;
};

export type WalletTransactionsResponse = {
  count: number;
  results: WalletTransaction[];
};

const PROVIDER_TO_MODE: Record<NonNullable<PaymentProvider>, string> = {
  orange: 'ORANGE',
  mtn: 'MTN',
  wave: 'WAVE',
  moov: 'MOOV',
};

export function paymentProviderToMode(provider: NonNullable<PaymentProvider>): string {
  return PROVIDER_TO_MODE[provider];
}

export function parseBalance(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function extractErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

export async function submitWalletDeposit(
  params: { amount: number; provider: NonNullable<PaymentProvider> },
): Promise<{ ok: true; data: DepositResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/wallet/deposit/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      montant_depose: params.amount,
      mode_de_paiement: paymentProviderToMode(params.provider),
    }),
  });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible d’effectuer le dépôt. Réessayez.') };
  }

  const data = body as DepositResponse;
  if (typeof data?.ref_transaction !== 'string') {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }

  return { ok: true, data };
}

export async function submitWalletWithdrawal(
  params: { amount: number; provider: NonNullable<PaymentProvider> },
): Promise<{ ok: true; data: WithdrawalResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/wallet/withdrawal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      montant_a_retirer: params.amount,
      mode_de_paiement: paymentProviderToMode(params.provider),
    }),
  });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible d’effectuer le retrait. Réessayez.'),
    };
  }

  const data = body as WithdrawalResponse;
  if (typeof data?.ref_transaction !== 'string') {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }

  return { ok: true, data };
}

export async function fetchWalletTransactions(): Promise<
  { ok: true; data: WalletTransactionsResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/wallet/transactions/', { method: 'GET' });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger les transactions.'),
    };
  }
  const data = body as WalletTransactionsResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

/**
 * Brique de polling : le backend n'expose pas d'endpoint "get one transaction by
 * ref", on retrouve donc le statut courant d'une transaction (identifiée par sa
 * `ref_transaction`) dans les 50 dernières transactions du wallet.
 * Renvoie `null` si la transaction n'apparaît pas encore dans la liste.
 */
export async function fetchTransactionStatus(
  ref: string,
): Promise<
  { ok: true; data: WalletTransaction | null } | { ok: false; detail: string }
> {
  const result = await fetchWalletTransactions();
  if (!result.ok) return result;
  const tx = result.data.results.find((t) => t.ref_transaction === ref) ?? null;
  return { ok: true, data: tx };
}
