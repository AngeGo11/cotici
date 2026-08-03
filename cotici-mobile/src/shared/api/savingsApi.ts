import { parseBalance } from './walletApi';
import { requestWithAuth } from './authFetch';

export type SavingsEtat = 'ACTIF' | 'ARCHIVÉ' | 'SUPPRIMÉ';

export type SavingsGoal = {
  id: number;
  nom_projet: string;
  objectif_cotisation: number;
  montant_courant: string;
  date_creation: string;
  categorie: string;
  duree: number;
  etat: SavingsEtat;
  objectif_atteint: boolean;
  date_archivage: string | null;
  date_suppression: string | null;
};

export type SavingsGoalsResponse = {
  count: number;
  results: SavingsGoal[];
};

export type CreateSavingsResponse = {
  id: number;
  nom_projet: string;
  montant_cible: number;
  duree: number;
  categorie: string;
};

export type CreateSavingsParams = {
  nom_projet: string;
  montant_cible: number;
  duree: number;
  categorie: string;
  value_categorie?: string;
};

export type UpdateSavingsParams = CreateSavingsParams & {
  id: string | number;
};

function extractErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

export function savingsGoalToUi(goal: SavingsGoal) {
  const saved = parseBalance(goal.montant_courant);
  const target = goal.objectif_cotisation;
  const goalCompleted = goal.objectif_atteint === true;
  const withdrawn = goalCompleted && saved === 0;
  const percentage = withdrawn
    ? 100
    : target > 0
      ? Math.min(100, Math.round((saved / target) * 100))
      : 0;
  return {
    id: String(goal.id),
    name: goal.nom_projet,
    saved,
    target,
    icon: 'target' as const,
    goalCompleted,
    withdrawn,
    percentage,
  };
}

export async function fetchSavingsGoals(): Promise<
  { ok: true; data: SavingsGoalsResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/savings/', { method: 'GET' });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger vos objectifs.'),
    };
  }
  const data = body as SavingsGoalsResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export async function createSavingsGoal(
  params: CreateSavingsParams,
): Promise<{ ok: true; data: CreateSavingsResponse } | { ok: false; detail: string }> {
  const payload: Record<string, string | number> = {
    nom_projet: params.nom_projet,
    montant_cible: params.montant_cible,
    duree: params.duree,
    categorie: params.categorie,
  };
  if (params.value_categorie) {
    payload.value_categorie = params.value_categorie;
  }

  const auth = await requestWithAuth('/api/savings/create/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de créer l’objectif. Réessayez.'),
    };
  }

  const data = body as CreateSavingsResponse;
  if (typeof data?.id !== 'number' || typeof data?.nom_projet !== 'string') {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }

  return { ok: true, data };
}

export async function updateSavingsGoal(
  params: UpdateSavingsParams,
): Promise<{ ok: true; data: SavingsGoal } | { ok: false; detail: string }> {
  const id = String(params.id).trim();
  if (!id) {
    return { ok: false, detail: 'Objectif introuvable.' };
  }

  const payload: Record<string, string | number> = {
    id: Number(id),
    nom_projet: params.nom_projet,
    montant_cible: params.montant_cible,
    duree: params.duree,
    categorie: params.categorie,
  };
  if (params.value_categorie) {
    payload.value_categorie = params.value_categorie;
  }

  const auth = await requestWithAuth('/api/savings/update/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de modifier l’objectif. Réessayez.'),
    };
  }

  if (!isValidSavingsGoal(body)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }

  return { ok: true, data: body };
}

function isValidSavingsGoal(data: unknown): data is SavingsGoal {
  if (!data || typeof data !== 'object') return false;
  const goal = data as SavingsGoal;
  return (
    typeof goal.id === 'number' &&
    typeof goal.nom_projet === 'string' &&
    typeof goal.objectif_cotisation === 'number' &&
    typeof goal.montant_courant === 'string' &&
    typeof goal.date_creation === 'string' &&
    typeof goal.duree === 'number' &&
    typeof goal.etat === 'string'
  );
}

export async function fetchSavingsDetail(
  goalId: string | number,
): Promise<{ ok: true; data: SavingsGoal } | { ok: false; detail: string }> {
  const id = String(goalId).trim();
  if (!id) {
    return { ok: false, detail: 'Objectif introuvable.' };
  }

  const auth = await requestWithAuth(
    `/api/savings/detail/?id=${encodeURIComponent(id)}`,
    { method: 'GET' },
  );
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger cet objectif.'),
    };
  }
  if (!isValidSavingsGoal(body)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data: body };
}

export type DepositToSavingsParams = {
  id: string | number;
  montant: number;
};

export async function depositToSavings(
  params: DepositToSavingsParams,
): Promise<{ ok: true; data: SavingsGoal } | { ok: false; detail: string }> {
  const id = String(params.id).trim();
  if (!id) {
    return { ok: false, detail: 'Objectif introuvable.' };
  }
  if (!Number.isFinite(params.montant) || params.montant <= 0) {
    return { ok: false, detail: 'Montant invalide.' };
  }

  const auth = await requestWithAuth('/api/savings/deposit/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id), montant: Math.round(params.montant) }),
  });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible d’ajouter à votre épargne. Réessayez.'),
    };
  }
  if (!isValidSavingsGoal(body)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data: body };
}

export type SavingsTransaction = {
  ref_transaction: string;
  montant_transaction: string;
  numero_telephone?: string;
  type_transaction: string;
  statut_transaction: string;
  mode_de_paiement: string;
  date_transaction: string;
};

export type SavingsTransactionsResponse = {
  count: number;
  results: SavingsTransaction[];
};

export async function fetchSavingsTransactions(
  goalId: string | number,
): Promise<{ ok: true; data: SavingsTransactionsResponse } | { ok: false; detail: string }> {
  const id = String(goalId).trim();
  if (!id) {
    return { ok: false, detail: 'Objectif introuvable.' };
  }

  const auth = await requestWithAuth(
    `/api/savings/transactions/?id=${encodeURIComponent(id)}`,
    { method: 'GET' },
  );
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger l’historique.'),
    };
  }

  const data = body as SavingsTransactionsResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export type WithdrawFromSavingsResponse = SavingsGoal & {
  ref_transaction: string;
  montant_retire: string;
};

export async function withdrawFromSavings(
  goalId: string | number,
): Promise<
  { ok: true; data: WithdrawFromSavingsResponse } | { ok: false; detail: string }
> {
  const id = String(goalId).trim();
  if (!id) {
    return { ok: false, detail: 'Objectif introuvable.' };
  }

  const auth = await requestWithAuth('/api/savings/withdraw/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id) }),
  });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de retirer votre épargne. Réessayez.'),
    };
  }

  if (!isValidSavingsGoal(body)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }

  const data = body as WithdrawFromSavingsResponse;
  if (typeof data.ref_transaction !== 'string') {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export async function fetchArchivedSavingsGoals(): Promise<
  { ok: true; data: SavingsGoalsResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/savings/archived/', { method: 'GET' });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger les objectifs archivés.'),
    };
  }
  const data = body as SavingsGoalsResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

async function postSavingsGoalAction(
  path: string,
  goalId: string | number,
  fallbackError: string,
): Promise<{ ok: true; data: SavingsGoal } | { ok: false; detail: string }> {
  const id = String(goalId).trim();
  if (!id) {
    return { ok: false, detail: 'Objectif introuvable.' };
  }

  const auth = await requestWithAuth(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: Number(id) }),
  });
  if (!auth.ok) return auth;

  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, fallbackError) };
  }
  if (!isValidSavingsGoal(body)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data: body };
}

export function archiveSavingsGoal(goalId: string | number) {
  return postSavingsGoalAction(
    '/api/savings/archive/',
    goalId,
    'Impossible d’archiver cet objectif.',
  );
}

export function deleteSavingsGoal(goalId: string | number) {
  return postSavingsGoalAction(
    '/api/savings/delete/',
    goalId,
    'Impossible de supprimer cet objectif.',
  );
}
