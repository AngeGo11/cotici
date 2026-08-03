import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { AuditEntry, ListParams, Paginated } from '@/lib/api/types';

export const auditKeys = {
  all: ['audit'] as const,
  list: (params: ListParams) => [...auditKeys.all, 'list', params] as const,
  detail: (id: number | string) => [...auditKeys.all, 'detail', id] as const,
};

export function useAuditList(params: ListParams) {
  return useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () => api.get<Paginated<AuditEntry>>(endpoints.audit.list, { params }),
    // Evite le clignotement de la table lors d'un changement de page.
    placeholderData: keepPreviousData,
  });
}

export function useAuditEntry(id: number | string | null) {
  return useQuery({
    queryKey: auditKeys.detail(id ?? ''),
    queryFn: () => api.get<AuditEntry>(endpoints.audit.detail(id as number)),
    enabled: id !== null,
  });
}
