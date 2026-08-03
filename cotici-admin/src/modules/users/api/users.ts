import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  AdminUser,
  AdminUserDetail,
  ListParams,
  Paginated,
  RevealedPii,
} from '@/lib/api/types';

export const usersKeys = {
  all: ['users'] as const,
  list: (params: ListParams) => [...usersKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...usersKeys.all, 'detail', id] as const,
};

export function useUsersList(params: ListParams) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => api.get<Paginated<AdminUser>>(endpoints.users.list, { params }),
    placeholderData: keepPreviousData,
  });
}

export function useUserDetail(id: number | null) {
  return useQuery({
    queryKey: usersKeys.detail(id ?? 'aucun'),
    queryFn: () => api.get<AdminUserDetail>(endpoints.users.detail(id as number)),
    enabled: id !== null,
  });
}

/** Suspend ou reactive un compte client. Un motif est exige cote serveur. */
export function useSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive, reason }: { id: number; isActive: boolean; reason: string }) =>
      api.post<AdminUserDetail>(
        isActive ? endpoints.users.reactivate(id) : endpoints.users.suspend(id),
        { reason },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.all });
    },
  });
}

/**
 * Revele les donnees personnelles d'un client.
 *
 * Volontairement une mutation (POST) : l'appel porte un motif et laisse une
 * trace nominative dans le journal d'audit. Le resultat n'est deliberement
 * PAS mis en cache — il ne doit vivre que le temps de l'affichage, et une
 * seconde consultation doit produire une seconde trace.
 */
export function useRevealPii() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post<RevealedPii>(endpoints.users.revealPii(id), { reason }),
  });
}
