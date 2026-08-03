import { requestWithAuth } from './authFetch';

export type CreateCagnotteParams = {
  nom_cagnotte: string;
  description_projet: string;
  objectif_collecte: number;
};

export type CreateCagnotteResponse = {
  id: number;
  type_tontine: string;
  nom_cagnotte: string;
  description: string;
  qr_code: string;
  hote_id: number;
  objectif_collecte: number;
};

export type CagnottePreview = {
  id: number;
  type_tontine: string;
  nom_cagnotte: string;
  motif: string;
  objectif_collecte: number;
  montant_collecte: number;
  progression_pct: number;
  objectif_atteint: boolean;
  recuperation_effectue: boolean;
  est_active: boolean;
  nb_contributeurs: number;
  organisateur_nom: string;
  qr_code: string;
  date_creation: string;
  est_organisateur: boolean;
  peut_cotiser: boolean;
  peut_valider_versement: boolean;
  montant_contribue?: number;
};

export type CagnotteListResponse = {
  count: number;
  results: CagnottePreview[];
};

export type CotiserCagnotteParams = {
  tontine_id: number;
  montant: number;
  mode_de_paiement?: string;
  idempotency_key?: string;
};

export type CotiserCagnotteResponse = {
  detail: string;
  ref_transaction: string;
  montant_collecte: string;
  objectif_collecte: string;
  objectif_atteint: boolean;
  tontine: {
    id: number;
    nom_contributeur: string;
    numero_contributeur: string;
    montant_verse: string;
  };
  idempotent_replay?: boolean;
};

export type RecuperationCagnotteResponse = {
  detail: string;
  ref_transaction: string;
  montant_verse: string;
  organisateur: string;
};

function extractErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

/** Lien public de contribution à une cagnotte. */
export function buildCagnotteLink(id: number | string): string {
  return `https://cotici.app/cagnotte-collect/${id}`;
}

/** Extrait l'id de cagnotte depuis un lien ou un payload QR. */
export function parseCagnotteId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const cagnottePath = trimmed.match(/cagnotte-collect\/(\d+)/i);
  if (cagnottePath) return cagnottePath[1];

  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export async function createCagnotte(
  params: CreateCagnotteParams,
): Promise<{ ok: true; data: CreateCagnotteResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/cagnotte/create/', {
    method: 'POST',
    body: JSON.stringify({
      nom_cagnotte: params.nom_cagnotte.trim(),
      description_projet: params.description_projet.trim(),
      objectif_collecte: params.objectif_collecte,
    }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de créer la cagnotte.'),
    };
  }
  return { ok: true, data: body as CreateCagnotteResponse };
}

export async function fetchCagnottePreview(
  id: string | number,
): Promise<{ ok: true; data: CagnottePreview } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(
    `/api/cagnotte/${encodeURIComponent(String(id))}/preview/`,
    { method: 'GET' },
  );
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Cagnotte introuvable.'),
    };
  }
  return { ok: true, data: body as CagnottePreview };
}

export async function fetchMyCagnotte(): Promise<
  { ok: true; data: CagnottePreview[] } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/cagnotte/mine/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger vos cagnottes.'),
    };
  }
  const data = body as CagnotteListResponse;
  return { ok: true, data: data.results ?? [] };
}

export async function fetchMyContributionsToCagnotte(): Promise<
  { ok: true; data: CagnottePreview[] } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/cagnotte/contributions/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger vos participations.'),
    };
  }
  const data = body as CagnotteListResponse;
  return { ok: true, data: data.results ?? [] };
}

export async function cotiserCagnotte(
  params: CotiserCagnotteParams,
): Promise<{ ok: true; data: CotiserCagnotteResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/cagnotte/cotiser/', {
    method: 'POST',
    body: JSON.stringify({
      tontine_id: params.tontine_id,
      montant: params.montant,
      mode_de_paiement: params.mode_de_paiement ?? 'SOLDE_COTICI',
      idempotency_key: params.idempotency_key,
    }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Participation impossible.'),
    };
  }
  return { ok: true, data: body as CotiserCagnotteResponse };
}

export async function recuperationCagnotte(
  id: string | number,
): Promise<{ ok: true; data: RecuperationCagnotteResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(
    `/api/cagnotte/${encodeURIComponent(String(id))}/verser/`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Versement impossible.'),
    };
  }
  return { ok: true, data: body as RecuperationCagnotteResponse };
}
