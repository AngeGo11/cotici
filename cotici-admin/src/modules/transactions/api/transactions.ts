import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  AdminTransaction,
  AdminTransactionDetail,
  ListParams,
  Paginated,
  TransactionForceStatusPayload,
} from '@/lib/api/types';

export const transactionsKeys = {
  all: ['transactions'] as const,
  list: (params: ListParams) => [...transactionsKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...transactionsKeys.all, 'detail', id] as const,
};

/** Filtres additionnels acceptes par GET /api/admin/transactions/. */
export interface TransactionListParams extends ListParams {
  statut?: string;
  type?: string;
  mode?: string;
}

export function useTransactionsList(params: TransactionListParams) {
  return useQuery({
    queryKey: transactionsKeys.list(params),
    queryFn: () => api.get<Paginated<AdminTransaction>>(endpoints.transactions.list, { params }),
    placeholderData: keepPreviousData,
  });
}

export function useTransactionDetail(id: number | string | null) {
  return useQuery({
    queryKey: transactionsKeys.detail(id ?? ''),
    queryFn: () => api.get<AdminTransactionDetail>(endpoints.transactions.detail(id as number)),
    enabled: id !== null,
  });
}

/**
 * Force le statut d'une transaction bloquee (EN ATTENTE) vers un statut
 * terminal. Un motif est exige cote serveur ; cette action ne recalcule
 * jamais le solde du wallet concerne (voir le back-office).
 */
export function useForceTransactionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & TransactionForceStatusPayload) =>
      api.post<AdminTransactionDetail>(endpoints.transactions.forceStatus(id), payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: transactionsKeys.all });
    },
  });
}
