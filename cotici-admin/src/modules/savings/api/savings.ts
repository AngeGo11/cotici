import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { ListParams, Paginated, SavingsDetail, SavingsListItem } from '@/lib/api/types';

/**
 * Module "Epargnes" — consultation seule (`GET /api/admin/savings/`,
 * `GET /api/admin/savings/{id}/`). Aucune mutation : le contrat d'API ne
 * prevoit aucune ecriture pour ce module.
 */
export const savingsEndpoints = endpoints.savings;

export const savingsKeys = {
  all: ['savings'] as const,
  list: (params: ListParams) => [...savingsKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...savingsKeys.all, 'detail', id] as const,
};

export function useSavingsList(params: ListParams) {
  return useQuery({
    queryKey: savingsKeys.list(params),
    queryFn: () => api.get<Paginated<SavingsListItem>>(savingsEndpoints.list, { params }),
    // Evite le clignotement de la table lors d'un changement de page/filtre.
    placeholderData: keepPreviousData,
  });
}

export function useSavingsDetail(id: number | string | null) {
  return useQuery({
    queryKey: savingsKeys.detail(id ?? ''),
    queryFn: () => api.get<SavingsDetail>(savingsEndpoints.detail(id as number)),
    enabled: id !== null,
  });
}
