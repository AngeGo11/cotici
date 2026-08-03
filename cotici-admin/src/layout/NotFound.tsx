import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <FileQuestion className="h-8 w-8 text-slate-300" aria-hidden />
      <div>
        <h1 className="text-base font-semibold text-slate-900">Page introuvable</h1>
        <p className="mt-1 text-xxs text-slate-500">
          L’adresse demandee n’existe pas ou a ete deplacee.
        </p>
      </div>
      <Link to={ROUTES.dashboard}>
        <Button variant="outline">Retour au tableau de bord</Button>
      </Link>
    </div>
  );
}
