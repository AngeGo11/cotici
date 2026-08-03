import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/client';

/** Nombre maximal de tentatives pour les erreurs reseau / 5xx. */
const MAX_RETRIES = 2;

/**
 * Aucune nouvelle tentative sur 401 / 403 / 404 / 400 : ce sont des reponses
 * definitives, reessayer ne ferait que multiplier les entrees d'audit.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if ([400, 401, 403, 404, 409, 422].includes(error.status)) return false;
  }
  return failureCount < MAX_RETRIES;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Donnees financieres : fraicheur courte, mais suffisante pour eviter
      // les rafales de requetes lors de la navigation entre ecrans.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // Une mutation d'administration ne doit jamais etre rejouee
      // automatiquement : elle peut deplacer de l'argent.
      retry: false,
    },
  },
});
