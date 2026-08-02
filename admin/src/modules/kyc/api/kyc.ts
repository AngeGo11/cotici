import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  KycNiveau,
  KycSubmission,
  KycSubmissionDetail,
  ListParams,
  Paginated,
} from '@/lib/api/types';

export const kycKeys = {
  all: ['kyc'] as const,
  list: (params: ListParams) => [...kycKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...kycKeys.all, 'detail', id] as const,
};

export function useKycQueue(params: ListParams) {
  return useQuery({
    queryKey: kycKeys.list(params),
    queryFn: () => api.get<Paginated<KycSubmission>>(endpoints.kyc.list, { params }),
    placeholderData: keepPreviousData,
  });
}

export function useKycDetail(id: number | null) {
  return useQuery({
    queryKey: kycKeys.detail(id ?? 'aucun'),
    queryFn: () => api.get<KycSubmissionDetail>(endpoints.kyc.detail(id as number)),
    enabled: id !== null,
  });
}

/** Approuve un dossier, eventuellement a un palier inferieur au demande. */
export function useApproveKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      niveau,
    }: {
      id: number;
      reason: string;
      niveau?: KycNiveau | '';
    }) =>
      api.post<KycSubmissionDetail>(endpoints.kyc.approve(id), {
        reason,
        niveau: niveau || '',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kycKeys.all });
    },
  });
}

/** Rejette un dossier. Le motif est repris tel quel dans la notification client. */
export function useRejectKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post<KycSubmissionDetail>(endpoints.kyc.reject(id), { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kycKeys.all });
    },
  });
}

/**
 * Marque un dossier comme pris en charge, pour eviter que deux operateurs
 * traitent le meme dossier. Signal de coordination : aucun motif exige.
 */
export function useTakeKycInReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      api.post<KycSubmissionDetail>(endpoints.kyc.takeInReview(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kycKeys.all });
    },
  });
}
