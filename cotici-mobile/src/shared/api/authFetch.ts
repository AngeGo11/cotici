import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  fetchWithAuth,
  type AuthFetchResult,
} from '@/shared/auth/fetchWithAuth';

type AuthFetchError = { ok: false; detail: string };
type AuthFetchSuccess = { ok: true; response: Response };

export async function requestWithAuth(
  path: string,
  init?: RequestInit,
): Promise<AuthFetchSuccess | AuthFetchError> {
  const result: AuthFetchResult = await fetchWithAuth(path, init);
  if (!result.ok) {
    if (result.reason === 'unauthenticated') {
      return { ok: false, detail: AUTH_SESSION_EXPIRED_MESSAGE };
    }
    return { ok: false, detail: 'Serveur inaccessible. Vérifiez votre connexion.' };
  }
  return { ok: true, response: result.response };
}
