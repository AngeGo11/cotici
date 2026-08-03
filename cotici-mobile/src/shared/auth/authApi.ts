import type { AuthUser } from './types';
import { parseAuthUser } from './types';

export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_PROXY_URL || 'http://127.0.0.1:8001';
}

export async function fetchCurrentUser(accessToken: string): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access: string; refresh: string } | null> {
  const res = await fetch(`${getApiBaseUrl()}/api/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access?: string; refresh?: string };
  if (typeof data.access !== 'string') return null;
  const nextRefresh = typeof data.refresh === 'string' ? data.refresh : refreshToken;
  return { access: data.access, refresh: nextRefresh };
}

export async function loadUserFromApi(accessToken: string): Promise<AuthUser | null> {
  const res = await fetchCurrentUser(accessToken);
  if (!res.ok) return null;
  const body: unknown = await res.json();
  return parseAuthUser(body);
}
