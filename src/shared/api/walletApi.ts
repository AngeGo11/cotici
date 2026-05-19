import { getApiBaseUrl } from '@/shared/auth/authApi';
import type { PaymentProvider } from '@/types';

export type DepositResponse = {
  numero_telephone_utilise: string;
  ancien_solde: string;
  montant_depot: string;
  nouveau_solde: string;
  ref_transaction: string;
};

export type WithdrawalResponse = {
  numero_telephone_utilise: string;
  ancien_solde: string;
  montant_retire: string;
  nouveau_solde: string;
  ref_transaction: string;
};


export type WalletTransaction = {
  ref_transaction: string;
  montant_transaction: string;
  numero_telephone?: string;
  type_transaction: string;
  statut_transaction: string;
  mode_de_paiement: string;
  date_transaction: string;
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
  accessToken: string,
  params: { amount: number; provider: NonNullable<PaymentProvider> },
): Promise<{ ok: true; data: DepositResponse } | { ok: false; detail: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/wallet/deposit/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        montant_depose: params.amount,
        mode_de_paiement: paymentProviderToMode(params.provider),
      }),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, detail: extractErrorDetail(body, 'Impossible d’effectuer le dépôt. Réessayez.') };
    }

    const data = body as DepositResponse;
    if (typeof data?.nouveau_solde !== 'string' || typeof data?.ref_transaction !== 'string') {
      return { ok: false, detail: 'Réponse serveur invalide.' };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, detail: 'Serveur inaccessible. Vérifiez votre connexion.' };
  }
}

export async function submitWalletWithdrawal(
  accessToken: string,
  params: { amount: number; provider: NonNullable<PaymentProvider> },
): Promise<{ ok: true; data: WithdrawalResponse } | { ok: false; detail: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/wallet/withdrawal/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        montant_a_retirer: params.amount,
        mode_de_paiement: paymentProviderToMode(params.provider),
      }),
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        detail: extractErrorDetail(body, 'Impossible d’effectuer le retrait. Réessayez.'),
      };
    }

    const data = body as WithdrawalResponse;
    if (typeof data?.nouveau_solde !== 'string' || typeof data?.ref_transaction !== 'string') {
      return { ok: false, detail: 'Réponse serveur invalide.' };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, detail: 'Serveur inaccessible. Vérifiez votre connexion.' };
  }
}

export async function fetchWalletTransactions(
  accessToken: string,
): Promise<{ ok: true; data: WalletTransactionsResponse } | { ok: false; detail: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/wallet/transactions/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
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
  } catch {
    return { ok: false, detail: 'Serveur inaccessible.' };
  }
}
