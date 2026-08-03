import { Suspense, useCallback, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useIdleTimer } from '@/hooks';
import { useToast } from '@/components/ui';
import { ErrorBoundary } from './ErrorBoundary';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
    </div>
  );
}

/** Coquille du back-office : navigation laterale, barre superieure, contenu. */
export function AdminShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { logout } = useAuth();
  const toast = useToast();

  const handleIdle = useCallback(() => {
    toast.warning('Session fermee', 'Deconnexion automatique apres inactivite.');
    void logout();
  }, [logout, toast]);

  const { remaining, isWarning } = useIdleTimer({ onIdle: handleIdle });

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar collapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onToggleSidebar={() => setCollapsed((value) => !value)}
          idleRemaining={remaining}
          idleWarning={isWarning}
        />

        <main className="flex-1 overflow-y-auto p-4">
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
