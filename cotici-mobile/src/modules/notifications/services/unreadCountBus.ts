/** Petit pub-sub pour forcer un rafraîchissement immédiat du compteur de
 * notifications non lues (badge accueil) dès qu'un push est reçu ou qu'une
 * notification est marquée comme lue depuis le deep-link handler — sans
 * attendre le polling de `useUnreadNotificationsCount`. */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeUnreadCountRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestUnreadCountRefresh(): void {
  listeners.forEach((listener) => listener());
}
