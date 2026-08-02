import { requestWithAuth } from './authFetch';
import type { AppNotification } from '@/types';

export type NotificationCategory =
  | 'invitation'
  | 'cotisation'
  | 'paiement'
  | 'securite'
  | 'epargne';

export type NotificationSourceType =
  | 'tontine'
  | 'cagnotte'
  | 'solidarity'
  | 'wallet'
  | 'transaction'
  | 'invitation'
  | 'auth'
  | '';

export type Notification = {
  id: number;
  category: NotificationCategory;
  objet: string;
  contenu: string;
  source_type: NotificationSourceType;
  source_id: number | null;
  est_lue: boolean;
  date_envoie: string;
  date_lecture: string | null;
};

export type NotificationsListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Notification[];
};

export type UnreadCountResponse = {
  unread: number;
};

function extractErrorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

export async function fetchNotifications(
  unreadOnly?: boolean,
  page?: number,
): Promise<{ ok: true; data: NotificationsListResponse } | { ok: false; detail: string }> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread', 'true');
  if (page && page > 1) params.set('page', String(page));
  const query = params.toString();
  const auth = await requestWithAuth(`/api/notifications/${query ? `?${query}` : ''}`, {
    method: 'GET',
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger vos notifications.') };
  }
  const data = body as NotificationsListResponse;
  if (!Array.isArray(data?.results)) {
    return { ok: false, detail: 'Réponse serveur invalide.' };
  }
  return { ok: true, data };
}

export async function fetchUnreadCount(): Promise<
  { ok: true; data: UnreadCountResponse } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/notifications/unread_count/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger le compteur.') };
  }
  return { ok: true, data: body as UnreadCountResponse };
}

export async function markNotificationRead(
  id: number,
): Promise<{ ok: true; data: Notification } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(`/api/notifications/${id}/mark_read/`, { method: 'POST' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de marquer cette notification comme lue.') };
  }
  return { ok: true, data: body as Notification };
}

export async function markAllNotificationsRead(): Promise<
  { ok: true; data: { updated: number } } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/notifications/mark_all_read/', { method: 'POST' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de marquer les notifications comme lues.') };
  }
  return { ok: true, data: body as { updated: number } };
}

const CATEGORY_TO_UI: Record<NotificationCategory, AppNotification['category']> = {
  invitation: 'invitation',
  cotisation: 'cotisation',
  paiement: 'paiement',
  securite: 'systeme',
  epargne: 'epargne',
};

/** Formate une date ISO en libellé relatif court, dans le style déjà utilisé
 * historiquement pour les notifications (ex: "Aujourd’hui · 09:14"). */
export function formatNotificationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays === 0) return `Aujourd’hui · ${time}`;
  if (diffDays === 1) return `Hier · ${time}`;
  if (diffDays > 1 && diffDays < 7) {
    const weekday = date.toLocaleDateString('fr-FR', { weekday: 'short' });
    const label = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '') + '.';
    return `${label} · ${time}`;
  }
  const day = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${day} · ${time}`;
}

/** Mappe une notification API vers le modèle utilisé par l'UI. */
export function mapNotification(notif: Notification): AppNotification {
  return {
    id: String(notif.id),
    destinataireId: '',
    objet: notif.objet,
    corps: notif.contenu,
    date: formatNotificationDate(notif.date_envoie),
    dateIso: notif.date_envoie,
    statut: 'ACCEPTE',
    estLue: notif.est_lue,
    category: CATEGORY_TO_UI[notif.category],
    sourceType: notif.source_type || undefined,
    sourceId: notif.source_id ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Push devices (enregistrement / désinscription du token Expo Push)
// ---------------------------------------------------------------------------

export type RegisterPushDeviceParams = {
  expo_token: string;
  device_id: string;
  platform: 'ios' | 'android' | 'web';
  app_version: string;
};

/** Enregistre (ou met à jour, endpoint idempotent) le token Expo Push de cet
 * appareil auprès du backend. */
export async function registerPushDevice(
  params: RegisterPushDeviceParams,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/notifications/devices/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!auth.ok) return auth;
  if (!auth.response.ok) {
    const body: unknown = await auth.response.json().catch(() => null);
    return { ok: false, detail: extractErrorDetail(body, "Impossible d'activer les notifications push.") };
  }
  return { ok: true };
}

/** Désinscrit ce token Expo Push (appelé au logout, pour ne plus recevoir de
 * notifications sur cet appareil une fois déconnecté). */
export async function unregisterPushDevice(
  expoToken: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const auth = await requestWithAuth(`/api/notifications/devices/${encodeURIComponent(expoToken)}/`, {
    method: 'DELETE',
  });
  if (!auth.ok) return auth;
  if (!auth.response.ok && auth.response.status !== 404) {
    const body: unknown = await auth.response.json().catch(() => null);
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de désinscrire cet appareil.') };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Préférences de notifications
// ---------------------------------------------------------------------------

export type NotificationPreferences = {
  push_enabled: boolean;
  categories_muted: NotificationCategory[];
};

export async function fetchNotificationPreferences(): Promise<
  { ok: true; data: NotificationPreferences } | { ok: false; detail: string }
> {
  const auth = await requestWithAuth('/api/notifications/preferences/', { method: 'GET' });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de charger vos préférences.') };
  }
  return { ok: true, data: body as NotificationPreferences };
}

export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<{ ok: true; data: NotificationPreferences } | { ok: false; detail: string }> {
  const auth = await requestWithAuth('/api/notifications/preferences/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!auth.ok) return auth;
  const body: unknown = await auth.response.json().catch(() => null);
  if (!auth.response.ok) {
    return { ok: false, detail: extractErrorDetail(body, 'Impossible de mettre à jour vos préférences.') };
  }
  return { ok: true, data: body as NotificationPreferences };
}
