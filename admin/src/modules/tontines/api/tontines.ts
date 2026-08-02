import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  ListParams,
  Paginated,
  TontineDetail,
  TontineListItem,
  TontineModerationAction,
} from '@/lib/api/types';

export const tontinesEndpoints = endpoints.tontines;

export const tontinesKeys = {
  all: ['tontines'] as const,
  list: (params: ListParams) => [...tontinesKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...tontinesKeys.all, 'detail', id] as const,
};

export interface TontineListParams extends ListParams {
  etat?: string;
}

/** Liste paginee des tontines de groupe (recherche, filtre par etat, tri par date desc cote serveur). */
export function useTontineList(params: TontineListParams) {
  return useQuery({
    queryKey: tontinesKeys.list(params),
    queryFn: () => api.get<Paginated<TontineListItem>>(tontinesEndpoints.list, { params }),
    placeholderData: keepPreviousData,
  });
}

/** Fiche detail (regles, membres, tours, penalites en cours). `id` nul desactive la requete. */
export function useTontineDetail(id: number | string | null) {
  return useQuery({
    queryKey: tontinesKeys.detail(id ?? ''),
    queryFn: () => api.get<TontineDetail>(tontinesEndpoints.detail(id as number | string)),
    enabled: id !== null,
  });
}

/** Archive, restaure ou supprime (logiquement) une tontine de groupe. Motif exige cote serveur. */
export function useModerateTontine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: number;
      action: TontineModerationAction;
      reason: string;
    }) => api.post<TontineListItem>(tontinesEndpoints.moderate(id), { action, reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tontinesKeys.all });
    },
  });
}
