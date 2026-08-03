import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  Dispute,
  DisputeDetail,
  DisputeResolvePayload,
  ListParams,
  Paginated,
} from '@/lib/api/types';

export const disputesKeys = {
  all: ['disputes'] as const,
  list: (params: ListParams) => [...disputesKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...disputesKeys.all, 'detail', id] as const,
};

export function useDisputeList(params: ListParams) {
  return useQuery({
    queryKey: disputesKeys.list(params),
    queryFn: () => api.get<Paginated<Dispute>>(endpoints.disputes.list, { params }),
    // Evite le clignotement de la table lors d'un changement de page/filtre.
    placeholderData: keepPreviousData,
  });
}

export function useDispute(id: number | string | null) {
  return useQuery({
    queryKey: disputesKeys.detail(id ?? ''),
    queryFn: () => api.get<DisputeDetail>(endpoints.disputes.detail(id as number)),
    enabled: id !== null,
  });
}

/** Tranche un litige (resolu/rejete). Motif et decision exiges cote serveur. */
export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number | string; payload: DisputeResolvePayload }) =>
      api.post<DisputeDetail>(endpoints.disputes.resolve(id), payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: disputesKeys.all });
    },
  });
}
