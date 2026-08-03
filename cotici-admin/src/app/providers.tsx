import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider, useToast } from '@/components/ui';
import { setForbiddenHandler, setUnauthorizedHandler } from '@/lib/api/client';
import { REDIRECT_PARAM, ROUTES } from './routes';
import { queryClient } from './queryClient';

/**
 * Branche la couche fetch sur l'interface :
 *  - 401 : la session a expire cote serveur -> retour a l'ecran de connexion ;
 *  - 403 : permission insuffisante -> notification, sans quitter la page.
 */
function ApiEventBridge({ children }: { children: ReactNode }) {
  const toast = useToast();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const current = `${window.location.pathname}${window.location.search}`;
      const suffix =
        current && current !== ROUTES.root
          ? `?${REDIRECT_PARAM}=${encodeURIComponent(current)}`
          : '';
      // Rechargement complet : purge l'etat en memoire susceptible de contenir
      // des donnees sensibles.
      window.location.assign(`${ROUTES.login}${suffix}`);
    });

    setForbiddenHandler((message) => {
      toast.error('Permission insuffisante', message);
    });

    return () => {
      setUnauthorizedHandler(null);
      setForbiddenHandler(null);
    };
  }, [toast]);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ApiEventBridge>
          <AuthProvider>{children}</AuthProvider>
        </ApiEventBridge>
      </ToastProvider>
    </QueryClientProvider>
  );
}
