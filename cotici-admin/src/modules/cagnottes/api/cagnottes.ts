import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  CagnotteDetail,
  CagnotteListItem,
  CagnotteModeratePayload,
  ListParams,
  Paginated,
} from '@/lib/api/types';

export const cagnottesKeys = {
  all: ['cagnottes'] as const,
  list: (params: ListParams) => [...cagnottesKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...cagnottesKeys.all, 'detail', id] as const,
};

export function useCagnottesList(params: ListParams) {
  return useQuery({
    queryKey: cagnottesKeys.list(params),
    queryFn: () => api.get<Paginated<CagnotteListItem>>(endpoints.cagnottes.list, { params }),
    placeholderData: keepPreviousData,
  });
}

export function useCagnotteDetail(id: number | string | null) {
  return useQuery({
    queryKey: cagnottesKeys.detail(id ?? 'none'),
    queryFn: () => api.get<CagnotteDetail>(endpoints.cagnottes.detail(id as number | string)),
    enabled: id !== null,
  });
}

/** Modere une cagnotte (archiver / restaurer / supprimer logiquement). Un motif est exige cote serveur. */
export function useModerateCagnotte() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & CagnotteModeratePayload) =>
      api.post<CagnotteListItem>(endpoints.cagnottes.moderate(id), payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cagnottesKeys.all });
    },
  });
}
