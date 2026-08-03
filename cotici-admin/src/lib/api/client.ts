import { API_BASE_URL, CSRF_HEADER_NAME } from '../constants';
import { ensureCsrfToken, getCsrfToken } from './csrf';
import type { ApiErrorPayload } from './types';

/** Erreur normalisee issue de l'enveloppe DRF. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Erreurs par champ ({ password: ["Trop court"] }). */
  readonly fieldErrors: Record<string, string[]>;
  readonly payload: ApiErrorPayload | null;

  constructor(
    status: number,
    message: string,
    options: {
      code?: string;
      fieldErrors?: Record<string, string[]>;
      payload?: ApiErrorPayload | null;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors ?? {};
    this.payload = options.payload ?? null;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Erreur reseau / serveur indisponible. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/* -------------------------------------------------------------------------
 * Petit bus d'evenements : evite un couplage direct entre la couche fetch et
 * React (routeur, systeme de toasts). Les handlers sont branches au montage
 * de l'application.
 * ---------------------------------------------------------------------- */

type UnauthorizedHandler = () => void;
type ForbiddenHandler = (message: string) => void;

let onUnauthorized: UnauthorizedHandler | null = null;
let onForbidden: ForbiddenHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export function setForbiddenHandler(handler: ForbiddenHandler | null): void {
  onForbidden = handler;
}

/** Chemins pour lesquels un 401 ne doit pas declencher de redirection. */
const SILENT_401_PATHS = ['/api/admin/me/', '/api/admin/auth/'];

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: string;
  /** Corps JSON serialise automatiquement. */
  body?: unknown;
  /** Parametres de requete ; les valeurs nulles/undefined sont ignorees. */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** Desactive la redirection automatique sur 401. */
  skipAuthRedirect?: boolean;
  /** Desactive le toast automatique sur 403. */
  skipForbiddenToast?: boolean;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const base = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  if (!params) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  if (!query) return base;
  return base.includes('?') ? `${base}&${query}` : `${base}?${query}`;
}

/**
 * Extrait un message lisible et les erreurs de champ depuis l'enveloppe DRF.
 * DRF renvoie soit {"detail": "..."}, soit {"champ": ["msg"]},
 * soit {"non_field_errors": ["msg"]}.
 */
function parseDrfError(status: number, payload: unknown): ApiError {
  if (payload === null || typeof payload !== 'object') {
    return new ApiError(status, defaultMessageFor(status), { payload: null });
  }

  const data = payload as ApiErrorPayload;
  const fieldErrors: Record<string, string[]> = {};
  let message = '';

  for (const [key, value] of Object.entries(data)) {
    if (key === 'code') continue;
    const messages = Array.isArray(value)
      ? value.map((item) => String(item))
      : typeof value === 'string'
        ? [value]
        : [];
    if (messages.length === 0) continue;

    if (key === 'detail' || key === 'non_field_errors') {
      message = message || messages[0];
    } else {
      fieldErrors[key] = messages;
    }
  }

  if (!message) {
    const firstField = Object.values(fieldErrors)[0];
    message = firstField?.[0] ?? defaultMessageFor(status);
  }

  return new ApiError(status, message, {
    code: typeof data.code === 'string' ? data.code : undefined,
    fieldErrors,
    payload: data,
  });
}

function defaultMessageFor(status: number): string {
  switch (status) {
    case 0:
      return 'Serveur injoignable. Verifiez votre connexion.';
    case 400:
      return 'Requete invalide.';
    case 401:
      return 'Session expiree. Veuillez vous reconnecter.';
    case 403:
      return 'Permission insuffisante pour effectuer cette action.';
    case 404:
      return 'Ressource introuvable.';
    case 409:
      return 'Conflit : la ressource a ete modifiee entre-temps.';
    case 429:
      return 'Trop de requetes. Merci de patienter.';
    case 500:
      return 'Erreur interne du serveur.';
    default:
      return `Erreur inattendue (${status}).`;
  }
}

/** Requete HTTP authentifiee par cookie de session. Aucun token en JS. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    params,
    headers,
    skipAuthRedirect = false,
    skipForbiddenToast = false,
    ...rest
  } = options;

  const upperMethod = method.toUpperCase();
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');

  let serializedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      serializedBody = body;
    } else {
      requestHeaders.set('Content-Type', 'application/json');
      serializedBody = JSON.stringify(body);
    }
  }

  // Jeton CSRF sur les seules methodes d'ecriture (comportement standard de
  // Django/DRF). Le poser aussi sur les lectures est inutile et fragile : le
  // jeton tourne a la connexion, la premiere lecture partirait avec l'ancien.
  if (UNSAFE_METHODS.has(upperMethod)) {
    const token = getCsrfToken() ?? (await ensureCsrfToken());
    if (token) requestHeaders.set(CSRF_HEADER_NAME, token);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...rest,
      method: upperMethod,
      headers: requestHeaders,
      // Cookie de session HttpOnly : jamais lu ni stocke cote JavaScript.
      credentials: 'include',
      body: serializedBody,
    });
  } catch {
    throw new ApiError(0, defaultMessageFor(0));
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get('Content-Type') ?? '';
    if (!contentType.includes('application/json')) return undefined as T;
    return (await response.json()) as T;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const error = parseDrfError(response.status, payload);

  if (error.isUnauthorized && !skipAuthRedirect) {
    const isSilent = SILENT_401_PATHS.some((silent) => path.startsWith(silent));
    if (!isSilent) onUnauthorized?.();
  }

  if (error.isForbidden && !skipForbiddenToast) {
    onForbidden?.(error.message || defaultMessageFor(403));
  }

  throw error;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/** Message d'erreur affichable, quelle que soit la nature de l'exception. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Une erreur inattendue est survenue.';
}
