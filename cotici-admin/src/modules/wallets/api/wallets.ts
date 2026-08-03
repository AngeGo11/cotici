import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  ListParams,
  Paginated,
  WalletAdjustPayload,
  WalletDetail,
  WalletSummary,
} from '@/lib/api/types';

export const walletsKeys = {
  all: ['wallets'] as const,
  list: (params: ListParams) => [...walletsKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...walletsKeys.all, 'detail', id] as const,
};

/** Liste paginee des portefeuilles (recherche + tri delegues a l'API). */
export function useWalletList(params: ListParams) {
  return useQuery({
    queryKey: walletsKeys.list(params),
    queryFn: () => api.get<Paginated<WalletSummary>>(endpoints.wallets.list, { params }),
    // Evite le clignotement de la table lors d'un changement de page/tri.
    placeholderData: keepPreviousData,
  });
}

/** Fiche detail d'un portefeuille (solde + dernieres transactions). */
export function useWalletDetail(id: number | string | null) {
  return useQuery({
    queryKey: walletsKeys.detail(id ?? ''),
    queryFn: () => api.get<WalletDetail>(endpoints.wallets.detail(id as number)),
    enabled: id !== null,
  });
}

/** Ajuste manuellement le solde d'un portefeuille. Motif obligatoire, revalide cote serveur. */
export function useAdjustWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: number } & WalletAdjustPayload) =>
      api.post<WalletDetail>(endpoints.wallets.adjust(id), { amount, reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: walletsKeys.all });
      void queryClient.invalidateQueries({ queryKey: walletsKeys.detail(variables.id) });
    },
  });
}
