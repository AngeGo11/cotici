import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import { ErrorBoundary } from '@/layout/ErrorBoundary';

/** Attente pendant le chargement paresseux d'une route. */
function AppFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        {/* Frontiere Suspense globale : les routes du parcours de connexion
            sont chargees en lazy() hors de AdminShell, qui possede la sienne. */}
        <Suspense fallback={<AppFallback />}>
          <RouterProvider router={router} />
        </Suspense>
      </AppProviders>
    </ErrorBoundary>
  );
}
