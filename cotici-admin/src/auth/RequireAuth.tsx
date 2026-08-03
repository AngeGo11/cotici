import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { REDIRECT_PARAM, ROUTES } from '@/app/routes';
import { useAuth } from './useAuth';

/** Ecran d'attente pendant la restauration de session. */
function SessionLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span className="text-[13px]">Verification de la session…</span>
      </div>
    </div>
  );
}

/** Protege l'ensemble des routes du back-office. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <SessionLoader />;

  if (status === 'anonymous') {
    const target = `${location.pathname}${location.search}`;
    const suffix =
      target && target !== ROUTES.root
        ? `?${REDIRECT_PARAM}=${encodeURIComponent(target)}`
        : '';
    return <Navigate to={`${ROUTES.login}${suffix}`} replace />;
  }

  return <Outlet />;
}

/** Empeche un utilisateur deja connecte de revenir sur l'ecran de connexion. */
export function RequireAnonymous() {
  const { status } = useAuth();

  if (status === 'loading') return <SessionLoader />;
  if (status === 'authenticated') return <Navigate to={ROUTES.dashboard} replace />;

  return <Outlet />;
}
