import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import type { Permission } from '@/lib/permissions';
import { useAuth } from './useAuth';

/**
 * Garde de route basee sur les permissions.
 *
 * RAPPEL : masquage d'interface uniquement. Le backend refuse de toute facon
 * l'acces aux endpoints correspondants (403) si la permission manque.
 */
export function RequirePermission({
  permissions,
  /** "any" (defaut) : une seule permission suffit. "all" : toutes requises. */
  mode = 'any',
  children,
}: {
  permissions: Permission[];
  mode?: 'any' | 'all';
  children?: ReactNode;
}) {
  const { canAny, canAll } = useAuth();
  const allowed = mode === 'all' ? canAll(permissions) : canAny(permissions);

  if (!allowed) return <Navigate to={ROUTES.forbidden} replace />;

  return <>{children ?? <Outlet />}</>;
}

/** Variante inline : masque ses enfants au lieu de rediriger. */
export function IfPermission({
  permissions,
  mode = 'any',
  fallback = null,
  children,
}: {
  permissions: Permission[];
  mode?: 'any' | 'all';
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { canAny, canAll } = useAuth();
  const allowed = mode === 'all' ? canAll(permissions) : canAny(permissions);
  return <>{allowed ? children : fallback}</>;
}
