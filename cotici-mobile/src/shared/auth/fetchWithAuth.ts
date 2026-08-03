import { getApiBaseUrl, refreshAccessToken } from './authApi';
import { parseAuthUser, type AuthUser } from './types';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './tokenStorage';

export const AUTH_SESSION_EXPIRED_MESSAGE = 'Session expirée. Reconnectez-vous.';

export type AuthFetchResult =
  | { ok: true; response: Response }
  | { ok: false; reason: 'unauthenticated' | 'network' };

let onSessionExpired: (() => void) | null = null;
let refreshPromise: Promise<{ access: string; refresh: string } | null> | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

async function expireSession(): Promise<void> {
  await clearTokens();
  onSessionExpired?.();
}

async function refreshTokensOnce(): Promise<{ access: string; refresh: string } | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = await getRefreshToken();
      if (!refresh) return null;
      const tokens = await refreshAccessToken(refresh);
      if (tokens) {
        await saveTokens(tokens.access, tokens.refresh);
      }
      return tokens;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function resolveAccessToken(): Promise<string | null> {
  const access = await getAccessToken();
  if (access) return access;
  const tokens = await refreshTokensOnce();
  return tokens?.access ?? null;
}

function withAuthHeader(token: string, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

function resolveUrl(path: string): string {
  return path.startsWith('http') ? path : `${getApiBaseUrl()}${path}`;
}

export async function fetchWithAuth(
  path: string,
  init: RequestInit = {},
): Promise<AuthFetchResult> {
  let access = await resolveAccessToken();
  if (!access) {
    await expireSession();
    return { ok: false, reason: 'unauthenticated' };
  }

  try {
    let response = await fetch(resolveUrl(path), withAuthHeader(access, init));

    if (response.status === 401) {
      const tokens = await refreshTokensOnce();
      if (!tokens) {
        await expireSession();
        return { ok: false, reason: 'unauthenticated' };
      }
      access = tokens.access;
      response = await fetch(resolveUrl(path), withAuthHeader(access, init));
      if (response.status === 401) {
        await expireSession();
        return { ok: false, reason: 'unauthenticated' };
      }
    }

    return { ok: true, response };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function loadCurrentUser(): Promise<AuthUser | null> {
  const result = await fetchWithAuth('/api/me', { method: 'GET' });
  if (!result.ok) return null;
  const body: unknown = await result.response.json();
  return parseAuthUser(body);
}
