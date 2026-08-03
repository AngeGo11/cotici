import { errorMessage } from '@/lib/api/client';
import { formatDate, formatDateTime, formatFullName } from '@/lib/format';
import { Badge, Button, Modal, Money, SkeletonText } from '@/components/ui';
import { useCagnotteDetail } from '../api/cagnottes';
import { CagnotteProgress } from './CagnotteProgress';

/** Fiche detail d'une cagnotte : organisateur, objectif, membres. */
export function CagnotteDetailModal({
  cagnotteId,
  onClose,
}: {
  cagnotteId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useCagnotteDetail(cagnotteId);

  return (
    <Modal
      open={cagnotteId !== null}
      onClose={onClose}
      title={data ? data.nom_cagnotte : 'Cagnotte'}
      description={data ? `Creee le ${formatDate(data.date_creation)}` : undefined}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {isLoading ? (
        <SkeletonText lines={5} />
      ) : isError ? (
        <p className="text-xxs text-red-600">{errorMessage(error)}</p>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="field-label">Organisateur</p>
              <p className="text-[13px] font-medium text-slate-900">
                {formatFullName(data.organisateur)}
              </p>
              <p className="font-mono text-xxs text-slate-500">
                {data.organisateur.numero_telephone_masque}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="field-label">Objectif</p>
              <p className="text-[13px] font-medium text-slate-900">
                <Money value={data.montant_collecte} /> {' / '}
                <Money value={data.objectif_cotisation} />
              </p>
              <div className="mt-1.5">
                <CagnotteProgress
                  progression={data.progression}
                  objectifAtteint={data.objectif_atteint}
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="field-label">Description</p>
            <p className="text-[13px] text-slate-700">{data.description || '—'}</p>
          </div>

          <div className="flex flex-wrap gap-2 text-xxs">
            <Badge tone={data.est_active ? 'success' : 'neutral'}>
              {data.est_active ? 'Active' : 'Inactive'}
            </Badge>
            {data.objectif_atteint && <Badge tone="success">Objectif atteint</Badge>}
            {data.recuperation_effectue && <Badge tone="info">Fonds recuperes</Badge>}
          </div>

          <div>
            <p className="field-label">Membres ({data.membres.length})</p>
            {data.membres.length === 0 ? (
              <p className="text-xxs text-slate-500">Aucun membre pour le moment.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {data.membres.map((membre) => (
                  <li
                    key={membre.id}
                    className="flex items-center justify-between px-3 py-2 text-[13px]"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{membre.membre_username}</p>
                      <p className="font-mono text-xxs text-slate-500">
                        {membre.membre_numero_telephone_masque}
                      </p>
                    </div>
                    <div className="text-right text-xxs text-slate-500">
                      <p>{membre.role_membre}</p>
                      <p>{formatDateTime(membre.date_adhesion)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
