import { requestWithAuth } from './authFetch';

export type CreateSolidarityTontineParams = {
  beneficiaire: string;
  motif: string;
  objectif_collecte: number;
};

export type CreateSolidarityTontineResponse = {
  id: number;
  type_tontine: string;
  description: string;
  qr_code: string;
  hote_id: number;
  objectif_collecte: number;
  beneficiaire_trouve: boolean;
};

export type SolidarityCollectPreview = {
  id: number;
  type_tontine: string;
  motif: string;
  objectif_collecte: number;
  montant_collecte: number;
  progression_pct: number;
  objectif_atteint: boolean;
  versement_effectue: boolean;
  est_active: boolean;
  etat?: string;
  date_archivage?: string | null;
  date_suppression?: string | null;
  nb_contributeurs: number;
  organisateur_nom: string;
  qr_code: string;
  date_creation: string;
  est_beneficiaire: boolean;
  est_organisateur: boolean;
  peut_cotiser: boolean;
  peut_valider_versement: boolean;
  montant_contribue?: number;
  beneficiaire_nom?: string;
  beneficiaire_telephone?: string;
};

export type SolidarityCollectListResponse = {
  count: number;
  results: SolidarityCollectPreview[];
};

export type CotiserSolidarityParams = {
  tontine_id: number;
  montant: number;
  mode_de_paiement?: string;
};

export type CotiserSolidarityResponse = {
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
};

export type VerserSolidarityResponse = {
  detail: string;
  ref_transaction: string;
  montant_verse: string;
  beneficiaire_nom: string;
};

function extractErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

/** Lien public de contribution à une collecte solidaire. */
export function buildSolidarityCollectLink(id: number | string): string {
  return `https://cotici.app/solidarity-collect/${id}`;
}

/** Extrait l'id de collecte depuis un lien ou un payload QR solidaire. */
export function parseSolidarityCollectId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const solidarityPath = trimmed.match(/solidarity-collect\/(\d+)/i);
  if (solidarityPath) return solidarityPath[1];

  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export async function createSolidarityTontine(
  params: CreateSolidarityTontineParams,
): Promise<
  { ok: true; data: CreateSolidarityTontineResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/solidarity/create/', {
    method: 'POST',
    body: JSON.stringify({
      type_tontine: 'SOLIDAIRE',
      beneficiaire: params.beneficiaire.trim(),
      motif: params.motif.trim(),
      objectif_collecte: params.objectif_collecte,
    }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de créer le groupe de soutien.'),
    };
  }
  return { ok: true, data: body as CreateSolidarityTontineResponse };
}

export async function fetchSolidarityPreview(
  id: string | number,
): Promise<{ ok: true; data: SolidarityCollectPreview } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(
    `/api/solidarity/${encodeURIComponent(String(id))}/preview/`,
    { method: 'GET' },
  );
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Collecte introuvable.'),
    };
  }
  return { ok: true, data: body as SolidarityCollectPreview };
}

export async function fetchMySolidarityCollects(): Promise<
  { ok: true; data: SolidarityCollectPreview[] } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/solidarity/mine/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger vos collectes.'),
    };
  }
  const data = body as SolidarityCollectListResponse;
  return { ok: true, data: data.results ?? [] };
}

export async function fetchMySolidarityContributions(): Promise<
  { ok: true; data: SolidarityCollectPreview[] } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/solidarity/contributions/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return {
      ok: false,
      detail: extractErrorDetail(body, 'Impossible de charger vos participations.'),
    };
  }
  const data = body as SolidarityCollectListResponse;
  return { ok: true, data: data.results ?? [] };
}

export async function cotiserSolidarityTontine(
  params: CotiserSolidarityParams,
): Promise<
  { ok: true; data: CotiserSolidarityResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/solidarity/cotiser/', {
    method: 'POST',
    body: JSON.stringify({
      tontine_id: params.tontine_id,
      montant: params.montant,
      mode_de_paiement: params.mode_de_paiement ?? 'SOLDE_COTICI',
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
  return { ok: true, data: body as CotiserSolidarityResponse };
}

export async function verserSolidarityCollect(
  id: string | number,
): Promise<{ ok: true; data: VerserSolidarityResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(
    `/api/solidarity/${encodeURIComponent(String(id))}/verser/`,
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
  return { ok: true, data: body as VerserSolidarityResponse };
}

async function postSolidarityAction(
  path: string,
  id: string | number,
  fallback: string,
): Promise<{ ok: true; data: SolidarityCollectPreview } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(path, {
    method: 'POST',
    body: JSON.stringify({ id: Number(id) }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, fallback) };
  }
  return { ok: true, data: body as SolidarityCollectPreview };
}

export function archiveSolidarityCollect(id: string | number) {
  return postSolidarityAction(
    '/api/solidarity/archive/',
    id,
    'Impossible d’archiver cette collecte.',
  );
}

export function deleteSolidarityCollect(id: string | number) {
  return postSolidarityAction(
    '/api/solidarity/delete/',
    id,
    'Impossible de supprimer cette collecte.',
  );
}
