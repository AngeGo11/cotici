import { API_BASE_URL, CSRF_COOKIE_NAME } from '../constants';
import { endpoints } from './endpoints';

/** Lit un cookie non HttpOnly (le cookie csrftoken de Django l'est rarement). */
export function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

/** Jeton CSRF courant, ou null s'il n'a pas encore ete amorce. */
export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE_NAME);
}

let bootstrapPromise: Promise<string | null> | null = null;

/**
 * Amorce le cookie CSRF via GET /api/admin/auth/csrf/.
 * Les appels concurrents partagent la meme requete.
 */
export async function ensureCsrfToken(): Promise<string | null> {
  const existing = getCsrfToken();
  if (existing) return existing;

  if (!bootstrapPromise) {
    bootstrapPromise = fetch(`${API_BASE_URL}${endpoints.auth.csrf}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(() => getCsrfToken())
      .catch(() => null)
      .finally(() => {
        bootstrapPromise = null;
      });
  }

  return bootstrapPromise;
}

/** Force un nouvel amorcage (apres deconnexion, rotation du jeton). */
export function resetCsrfBootstrap(): void {
  bootstrapPromise = null;
}
