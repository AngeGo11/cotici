import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { ListParams, Paginated, StaffMember } from '@/lib/api/types';

export const staffKeys = {
  all: ['staff'] as const,
  list: (params: ListParams) => [...staffKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...staffKeys.all, 'detail', id] as const,
};

export function useStaffList(params: ListParams) {
  return useQuery({
    queryKey: staffKeys.list(params),
    queryFn: () => api.get<Paginated<StaffMember>>(endpoints.staff.list, { params }),
    placeholderData: keepPreviousData,
  });
}

/** Active ou desactive un compte staff. Un motif est exige cote serveur. */
export function useSetStaffActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      isActive,
      reason,
    }: {
      id: number;
      isActive: boolean;
      reason: string;
    }) =>
      api.patch<StaffMember>(
        isActive ? endpoints.staff.reactivate(id) : endpoints.staff.deactivate(id),
        { reason },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}

/** Reinitialise la double authentification d'un compte staff. */
export function useResetStaffTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.patch<StaffMember>(endpoints.staff.resetTotp(id), { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.all });
    },
  });
}
