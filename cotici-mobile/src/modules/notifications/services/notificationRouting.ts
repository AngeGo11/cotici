/** Résout la destination de deep-link à partir du payload `data` reçu dans un
 * push (ou de la notification déjà mappée en base) : {source_type, source_id,
 * category, notification_id}. Cf. contrat backend figé. */

export type PushDataPayload = {
  source_type?: string;
  source_id?: string | number;
  category?: string;
  notification_id?: string | number;
};

export type ResolvedNotificationRoute =
  | { pathname: string; params?: Record<string, string> }
  | null;

/** `null` = pas de navigation (ex. sécurité) : on marque seulement comme lue. */
export function resolveNotificationRoute(data: PushDataPayload): ResolvedNotificationRoute {
  const sourceType = data.source_type;
  const sourceId = data.source_id != null ? String(data.source_id) : undefined;
  const category = data.category;

  if (category === 'securite' || sourceType === 'auth') {
    return null;
  }

  if ((category === 'cotisation' || sourceType === 'tontine') && sourceId) {
    return { pathname: '/tontine-details', params: { id: sourceId, focus: 'payment' } };
  }

  if (category === 'paiement' || sourceType === 'wallet' || sourceType === 'transaction') {
    // Pas de route `/activite` (liste) dans ce repo : l'écran réel est
    // `activites-recentes` (`/activite/[id]` n'existe que pour le détail).
    return { pathname: '/activites-recentes' };
  }

  if (category === 'epargne' || sourceType === 'savings') {
    return { pathname: '/(tabs)/savings' };
  }

  if (category === 'invitation' || sourceType === 'invitation') {
    return { pathname: '/invitations' };
  }

  if (sourceType === 'solidarity' && sourceId) {
    return { pathname: '/solidarity-collect/[id]', params: { id: sourceId } };
  }

  return null;
}
