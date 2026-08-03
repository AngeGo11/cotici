/** Types transverses du back-office (hors contrat d'API, cf. lib/api/types.ts). */

export type { Permission } from '@/lib/permissions';
export type {
  AdminMe,
  ApiErrorPayload,
  AuditEntry,
  DashboardStats,
  ListParams,
  LoginResponse,
  Paginated,
  StaffMember,
  TimeSeriesPoint,
} from '@/lib/api/types';

/** Etat generique d'une ressource distante. */
export type LoadState = 'idle' | 'loading' | 'success' | 'error';

/** Option generique pour les selecteurs. */
export interface Option<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Sens de tri applique cote serveur (parametre "ordering" de DRF). */
export type SortDirection = 'asc' | 'desc';

/** Rend obligatoires certaines cles d'un type partiel. */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
