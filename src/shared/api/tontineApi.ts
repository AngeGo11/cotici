import { requestWithAuth } from './authFetch';

export type TontinePhase = 'recruiting' | 'awaiting_ordre' | 'active' | 'completed';

export type TontineRegle = {
  objectif_cotisation: string;
  montant_cotisation: string;
  montant_penalite: string;
  nombre_max: number;
  nombre_tours: number;
  ordre_ramassage: string;
  frequence: string;
  frequence_personnalise: number | null;
  penalites_actives: boolean;
};

export type TontineTour = {
  id: number;
  numero_du_tour: number;
  beneficiaire_id: number;
  montant_depose: string;
  statut_tour: string;
};

export type TontineMember = {
  id: string;
  user_id: number;
  name: string;
  avatar: string;
  role: string;
  ordre_ramassage: number;
  status: 'none' | 'awaiting_payment' | 'waiting_turn' | 'paid' | 'beneficiary';
  amount: number;
  turn: number;
};

export type TontineSummary = {
  id: number;
  type_tontine: string;
  description: string;
  nom: string;
  est_active: boolean;
  etat?: string;
  date_archivage?: string | null;
  date_suppression?: string | null;
  date_creation: string;
  qr_code: string;
  hote_id: number;
  phase: TontinePhase;
  cycle_termine?: boolean;
  membres_actifs: number;
  nombre_max: number;
  ordre_mode: 'admin' | 'random' | null;
  ordre_publie: boolean;
  turn: string;
  cotisation_amount: number;
  objectif_total: number;
  amount: number;
  regles: TontineRegle | null;
  tour_courant: TontineTour | null;
  is_admin: boolean;
};

export type TontineDetail = TontineSummary & {
  membres: TontineMember[];
  pot_attendu: string;
  pot_collecte: string;
};

export type TontinesListResponse = {
  count: number;
  results: TontineSummary[];
};

export type ChatMessage = {
  id: number;
  contenu: string;
  date: string;
  expediteur_id: number;
  expediteur_nom: string;
  expediteur_avatar: string;
  is_me: boolean;
};

export type ChatMessagesResponse = {
  results: ChatMessage[];
  tontine_id: number;
  tontine_nom: string;
  membres_actifs: number;
};

export type TontineInvitation = {
  token: string;
  statut_invitation: string;
  date_invitation: string;
  numero_telephone_invite: string;
  tontine_id: number;
  tontine_nom: string;
  description?: string;
  hote_nom: string;
  membres_actifs: number;
  nombre_max: number;
  nombre_tours: number;
  cotisation_amount: number;
  objectif_total: number;
  pot_par_tour: number;
  frequence: string | null;
  frequence_personnalise?: number | null;
  ordre_ramassage?: string | null;
  montant_penalite?: number;
  penalites_actives?: boolean;
  phase: TontinePhase;
  regles_definies: boolean;
  regles: TontineRegle | null;
};

function extractErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

export function tontineSummaryToUi(t: TontineSummary) {
  const { current, total, pct } = parseTurn(t.turn);
  const isCompleted = t.phase === 'completed' || t.cycle_termine === true;
  return {
    id: String(t.id),
    name: t.nom,
    members: t.membres_actifs,
    turn: t.turn,
    turnCurrent: isCompleted ? total : current,
    turnTotal: total,
    turnPct: isCompleted ? 100 : pct,
    amount: t.amount,
    cotisationAmount: t.cotisation_amount,
    objectifTotal: t.objectif_total ?? 0,
    status: isCompleted ? ('completed' as const) : t.est_active ? ('active' as const) : ('paused' as const),
    cycleTermine: isCompleted,
    isSolidarity: false,
    phase: t.phase,
    nombreMax: t.nombre_max,
    ordreMode: t.ordre_mode,
    ordrePublie: t.ordre_publie,
    isAdmin: t.is_admin,
    qrCode: t.qr_code,
    description: t.description,
    tourCourant: t.tour_courant,
  };
}

export function parseTurn(turn: string): { current: number; total: number; pct: number } {
  const parts = turn.split('/');
  const current = Math.max(0, parseInt(parts[0] ?? '0', 10) || 0);
  const total = Math.max(1, parseInt(parts[1] ?? '1', 10) || 1);
  const pct = Math.min(100, Math.round((current / total) * 100));
  return { current, total, pct };
}

export type CreateTontineParams = {
  nom_projet: string;
  description?: string;
  type_tontine?: 'GROUPE';
};

export type DefineTontineReglesParams = {
  tontine_id: number;
  /** Mise de chaque participant à chaque tour. */
  montant_cotisation: number;
  nombre_max: number;
  frequence: string;
  frequence_personnalise?: number;
  ordre_ramassage: string;
  penalite?: boolean;
  type_penalite?: string;
  montant_penalite?: number;
};

export async function fetchTontines(): Promise<
  { ok: true; data: TontinesListResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/tontine/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger vos tontines.') };
  }
  const data = body as TontinesListResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export async function fetchRecruitingTontines(): Promise<
  { ok: true; data: TontinesListResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/tontine/recruiting/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger les groupes en cours.') };
  }
  const data = body as TontinesListResponse;
  return { ok: true, data: { count: data.count ?? 0, results: data.results ?? [] } };
}

export async function fetchTontineDetail(
  id: string | number,
): Promise<{ ok: true; data: TontineDetail } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(`/api/tontine/detail/?id=${encodeURIComponent(String(id))}`, {
    method: 'GET',
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Tontine introuvable.') };
  }
  return { ok: true, data: body as TontineDetail };
}

export async function createTontine(
  params: CreateTontineParams,
): Promise<
  { ok: true; data: { id: number; qr_code: string } } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/tontine/create/', {
    method: 'POST',
    body: JSON.stringify({
      type_tontine: 'GROUPE',
      nom_projet: params.nom_projet,
      description: params.description ?? '',
    }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Création impossible.') };
  }
  const data = body as { id: number; qr_code: string };
  return { ok: true, data };
}

export async function defineTontineRegles(
  params: DefineTontineReglesParams,
): Promise<{ ok: true; data: unknown } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/regles/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible d enregistrer les règles.') };
  }
  return { ok: true, data: body };
}

export async function sendTontineInvitation(
  tontineId: number,
  numero_telephone_invite: string,
): Promise<{ ok: true; data: { token: string } } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/invitations/', {
    method: 'POST',
    body: JSON.stringify({ tontine_id: tontineId, numero_telephone_invite }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Invitation impossible.') };
  }
  return { ok: true, data: body as { token: string } };
}

export async function acceptTontineInvitation(
  payload: { token?: string; tontine_id?: number; accepte_regles: boolean },
): Promise<{ ok: true; data: TontineDetail } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/invitations/accept/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de rejoindre le groupe.') };
  }
  const data = body as { tontine: TontineDetail };
  return { ok: true, data: data.tontine };
}

export async function fetchMyInvitations(): Promise<
  { ok: true; data: TontineInvitation[] } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/tontine/invitations/mine/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger vos invitations.') };
  }
  const data = body as { results: TontineInvitation[] };
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data: data.results };
}

export async function previewTontineInvitation(
  token: string,
): Promise<{ ok: true; data: TontineInvitation } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(
    `/api/tontine/invitations/preview/?token=${encodeURIComponent(token)}`,
    { method: 'GET' },
  );
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Invitation introuvable.') };
  }
  return { ok: true, data: body as TontineInvitation };
}

export async function refuseTontineInvitation(
  token: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/invitations/refuse/', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de refuser l invitation.') };
  }
  return { ok: true };
}

export async function fetchChatMessages(
  tontineId: number,
  afterId?: number,
): Promise<{ ok: true; data: ChatMessagesResponse } | { ok: false; detail: string }> {
  const params = new URLSearchParams({ tontine_id: String(tontineId) });
  if (afterId && afterId > 0) params.set('after', String(afterId));
  const auth = await requestWithAuth(`/api/tontine/chat/?${params.toString()}`, { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger la discussion.') };
  }
  const data = body as ChatMessagesResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export async function sendChatMessage(
  tontineId: number,
  contenu: string,
): Promise<{ ok: true; data: ChatMessage } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/chat/send/', {
    method: 'POST',
    body: JSON.stringify({ tontine_id: tontineId, contenu }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Message non envoyé.') };
  }
  return { ok: true, data: body as ChatMessage };
}

export async function setOrdreRamassage(
  tontineId: number,
  ordres: { membre_id: number; ordre_ramassage: number }[],
): Promise<{ ok: true; data: TontineDetail } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/ordre/', {
    method: 'POST',
    body: JSON.stringify({ tontine_id: tontineId, ordres }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de publier l ordre.') };
  }
  const data = body as { tontine: TontineDetail };
  return { ok: true, data: data.tontine };
}

export async function cotiserTontine(
  tontineId: number,
): Promise<
  { ok: true; data: { ref_transaction: string } } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/tontine/cotiser/', {
    method: 'POST',
    body: JSON.stringify({ tontine_id: tontineId, mode_de_paiement: 'SOLDE_COTICI' }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Cotisation impossible.') };
  }
  const data = body as { ref_transaction: string };
  return { ok: true, data };
}

export async function demarrerTontine(
  tontineId: number,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/tours/demarrer/', {
    method: 'POST',
    body: JSON.stringify({ tontine_id: tontineId }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de démarrer le tour.') };
  }
  return { ok: true };
}

export type ChangerTourResponse = {
  detail: string;
  tontine_id: number;
  tontine_terminee: boolean;
  numero_tour_actuel: number | null;
  nombre_tours_total: number;
};

export async function changerTour(
  tontineId: number,
): Promise<{ ok: true; data: ChangerTourResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/tours/changer/', {
    method: 'POST',
    body: JSON.stringify({ tontine_id: tontineId }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de clôturer le tour.') };
  }
  return { ok: true, data: body as ChangerTourResponse };
}

async function postTontineLifecycleAction(
  path: string,
  id: string | number,
  fallback: string,
): Promise<{ ok: true; data: TontineSummary } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(path, {
    method: 'POST',
    body: JSON.stringify({ id: Number(id) }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, fallback) };
  }
  return { ok: true, data: body as TontineSummary };
}

export function archiveGroupeTontine(id: string | number) {
  return postTontineLifecycleAction(
    '/api/tontine/archive/',
    id,
    'Impossible d’archiver cette tontine.',
  );
}

export function deleteGroupeTontine(id: string | number) {
  return postTontineLifecycleAction(
    '/api/tontine/delete/',
    id,
    'Impossible de supprimer cette tontine.',
  );
}

/** Mapping UI → API pour la création de règles */
export function mapFrequencyToApi(freq: 'daily' | 'weekly' | 'monthly' | 'custom'): string {
  const map = {
    daily: 'JOURNALIER',
    weekly: 'HEBDOMADAIRE',
    monthly: 'MENSUEL',
    custom: 'PERSONNALISÉE',
  } as const;
  return map[freq];
}

export function mapOrdreToApi(mode: 'random' | 'admin'): string {
  return mode === 'admin' ? "DÉFINI PAR L'ADMIN" : 'ALÉATOIRE';
}

export function mapPenaltyTypeToApi(type: 'retard' | 'absence'): string {
  return type === 'retard' ? 'RETARD PAIEMENT' : 'ABSENCE PAIEMENT';
}

/* --------------------------------------------------------------------- */
/* Administration de groupe : membres, rôles, règles, pénalités          */
/* --------------------------------------------------------------------- */

export type MembreGroupe = {
  id: number;
  user_id: number;
  name: string;
  role: 'ADMINISTRATEUR' | 'PARTICIPANT';
  statut: string;
  ordre_ramassage: number;
  regles_acceptees: boolean;
  is_hote: boolean;
  penalites_impayees: string;
  a_cotise_tour_courant: boolean;
  /** Présents uniquement si le demandeur est admin. */
  numero_telephone?: string;
  peut_etre_exclu?: boolean;
  motif_blocage_exclusion?: string | null;
};

export type MembresGroupeResponse = {
  count: number;
  results: MembreGroupe[];
};

export type ExclureMembreResult = {
  detail: string;
  membre_exclu_id: number;
  penalites_impayees: string;
  tontine: TontineDetail;
};

export async function fetchMembresGroupe(
  tontineId: string | number,
): Promise<{ ok: true; data: MembresGroupeResponse } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(
    `/api/tontine/membres/?tontine_id=${encodeURIComponent(String(tontineId))}`,
    { method: 'GET' },
  );
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger les membres.') };
  }
  const data = body as MembresGroupeResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export async function exclureMembre(params: {
  tontine_id: number;
  user_id: number;
  motif?: string;
}): Promise<{ ok: true; data: ExclureMembreResult } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/membres/exclure/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible d’exclure ce membre.') };
  }
  return { ok: true, data: body as ExclureMembreResult };
}

export type SetMemberRoleResult = {
  detail: string;
  membre_id: number;
  user_id: number;
  role: 'ADMINISTRATEUR' | 'PARTICIPANT';
};

export async function setMemberRole(params: {
  tontine_id: number;
  user_id: number;
  role: 'ADMINISTRATEUR' | 'PARTICIPANT';
}): Promise<{ ok: true; data: SetMemberRoleResult } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/membres/role/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de modifier le rôle.') };
  }
  return { ok: true, data: body as SetMemberRoleResult };
}

export type ModifierReglesParams = {
  tontine_id: number;
  montant_cotisation?: number;
  nombre_max?: number;
  ordre_ramassage?: string;
  frequence?: string;
  frequence_personnalise?: number;
  montant_penalite?: number;
};

export type ModifierReglesResult = {
  detail: string;
  regle: TontineRegle;
  champs_modifies: string[];
};

export type ModifierReglesError = {
  ok: false;
  detail: string;
  champs_verrouilles?: string[];
};

export async function modifierRegles(
  params: ModifierReglesParams,
): Promise<{ ok: true; data: ModifierReglesResult } | ModifierReglesError> {
  const auth = await requestWithAuth('/api/tontine/regles/modifier/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    const detail = extractErrorDetail(body, 'Impossible de modifier les règles.');
    const champsVerrouilles =
      body && typeof body === 'object' && Array.isArray((body as { champs_verrouilles?: unknown }).champs_verrouilles)
        ? ((body as { champs_verrouilles: string[] }).champs_verrouilles)
        : undefined;
    return { ok: false, detail, champs_verrouilles: champsVerrouilles };
  }
  return { ok: true, data: body as ModifierReglesResult };
}

export type Penalite = {
  id: number;
  tontine_id: number;
  user_id: number;
  type_penalite: 'RETARD PAIEMENT' | 'ABSENCE PAIEMENT';
  montant_penalite: string;
  montant_due: string;
  motif: string;
  est_reglee: boolean;
  est_annulee: boolean;
  date_attribution_penalite: string;
  date_reglement_penalite: string | null;
  date_annulation: string | null;
};

export type PenalitesResponse = {
  count: number;
  results: Penalite[];
  total_impaye: string;
};

export type PenaliteFilter = 'impayees' | 'reglees' | 'toutes';

export async function fetchPenalites(
  tontineId: string | number,
  statut: PenaliteFilter = 'toutes',
): Promise<{ ok: true; data: PenalitesResponse } | { ok: false; detail: string }> {
  const params = new URLSearchParams({ tontine_id: String(tontineId), statut });
  const auth = await requestWithAuth(`/api/tontine/penalites/?${params.toString()}`, {
    method: 'GET',
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger les pénalités.') };
  }
  const data = body as PenalitesResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export async function attribuerPenalite(params: {
  tontine_id: number;
  user_id?: number;
  numero_telephone?: string;
  type_penalite: 'RETARD PAIEMENT' | 'ABSENCE PAIEMENT';
  motif?: string;
}): Promise<{ ok: true; data: { detail: string; penalite: Penalite } } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/tontine/penalites/attribuer/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible d’attribuer cette pénalité.') };
  }
  return { ok: true, data: body as { detail: string; penalite: Penalite } };
}

async function postPenaliteAction(
  path: string,
  penaliteId: number,
  fallback: string,
): Promise<{ ok: true; data: { detail: string; penalite: Penalite } } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(path, {
    method: 'POST',
    body: JSON.stringify({ penalite_id: penaliteId }),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, fallback) };
  }
  return { ok: true, data: body as { detail: string; penalite: Penalite } };
}

export function reglerPenalite(penaliteId: number) {
  return postPenaliteAction(
    '/api/tontine/penalites/regler/',
    penaliteId,
    'Impossible de marquer cette pénalité comme réglée.',
  );
}

export function annulerPenalite(penaliteId: number) {
  return postPenaliteAction(
    '/api/tontine/penalites/annuler/',
    penaliteId,
    'Impossible d’annuler cette pénalité.',
  );
}
