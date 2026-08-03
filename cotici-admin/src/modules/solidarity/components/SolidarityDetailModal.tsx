import type { Solidarity } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { Button, Modal, Money, StatusPill } from '@/components/ui';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="text-[13px] text-slate-800">{children ?? '—'}</div>
    </div>
  );
}

export function SolidarityDetailModal({
  solidarity,
  onClose,
}: {
  solidarity: Solidarity | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={solidarity !== null}
      onClose={onClose}
      title="Detail de la collecte solidaire"
      description={solidarity ? `Collecte #${solidarity.id}` : undefined}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {solidarity && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Organisateur">
              {solidarity.hote.username}
              <span className="ml-1 font-mono text-xxs text-slate-500">
                ({solidarity.hote.numero_telephone_masque})
              </span>
            </Field>
            <Field label="Beneficiaire">
              <span className="font-mono text-xxs">
                {solidarity.beneficiaire_telephone_masque}
              </span>
            </Field>
            <Field label="Etat">
              <StatusPill status={solidarity.etat} />
            </Field>
            <Field label="Cree le">{formatDateTime(solidarity.date_creation)}</Field>
            <Field label="Objectif">
              <Money value={solidarity.objectif_cotisation} />
            </Field>
            <Field label="Collecte">
              <Money value={solidarity.montant_collecte} />
            </Field>
            <Field label="Progression">{solidarity.progression_pct.toFixed(0)} %</Field>
            <Field label="Objectif atteint">
              {solidarity.objectif_atteint ? 'Oui' : 'Non'}
            </Field>
            <Field label="Verse au beneficiaire">
              {solidarity.versement_effectue ? (
                <Money value={solidarity.montant_verse} />
              ) : (
                'Non'
              )}
            </Field>
          </div>

          <Field label="Description">
            <p className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[13px]">
              {solidarity.description || '—'}
            </p>
          </Field>
        </div>
      )}
    </Modal>
  );
}
