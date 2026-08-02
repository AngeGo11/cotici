import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { BREADCRUMB_LABELS } from './navigation';

/** Fil d'Ariane derive du chemin courant. */
export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Fil d’Ariane" className="flex items-center gap-1 text-xxs text-slate-500">
      <Link to={ROUTES.dashboard} className="hover:text-slate-800">
        Accueil
      </Link>
      {segments.map((segment, index) => {
        const to = `/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;
        const label = BREADCRUMB_LABELS[segment] ?? decodeURIComponent(segment);
        return (
          <span key={to} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden />
            {isLast ? (
              <span className="font-medium text-slate-700">{label}</span>
            ) : (
              <Link to={to} className="hover:text-slate-800">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
