import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui';

export default function Forbidden() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <ShieldAlert className="h-8 w-8 text-amber-400" aria-hidden />
      <div>
        <h1 className="text-base font-semibold text-slate-900">Acces refuse</h1>
        <p className="mt-1 max-w-sm text-xxs text-slate-500">
          Votre role ne dispose pas des permissions necessaires pour consulter cette section.
          Contactez un administrateur si vous pensez qu’il s’agit d’une erreur.
        </p>
      </div>
      <Link to={ROUTES.dashboard}>
        <Button variant="outline">Retour au tableau de bord</Button>
      </Link>
    </div>
  );
}
