import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { ListParams, Paginated, Solidarity } from '@/lib/api/types';

/**
 * Module "Solidarite" : consultation des tontines solidaires
 * (`/api/admin/solidarity/`). Le contrat d'API est en lecture seule (aucune
 * action de moderation dediee n'est exposee).
 */
export const solidarityKeys = {
  all: ['solidarity'] as const,
  list: (params: ListParams) => [...solidarityKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...solidarityKeys.all, 'detail', id] as const,
};

export function useSolidarityList(params: ListParams) {
  return useQuery({
    queryKey: solidarityKeys.list(params),
    queryFn: () => api.get<Paginated<Solidarity>>(endpoints.solidarity.list, { params }),
    // Evite le clignotement de la table lors d'un changement de page/filtre.
    placeholderData: keepPreviousData,
  });
}

export function useSolidarityDetail(id: number | string | null) {
  return useQuery({
    queryKey: solidarityKeys.detail(id ?? ''),
    queryFn: () => api.get<Solidarity>(endpoints.solidarity.detail(id as number)),
    enabled: id !== null,
  });
}
