import type { ReactNode } from 'react';
import type { TontineDetail } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/format';
import { Badge, Modal, Money, Skeleton, StatusPill, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { useTontineDetail } from '../api/tontines';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="text-[13px] text-slate-800">{children ?? '—'}</div>
    </div>
  );
}

/** Correspondance etat back-office -> apparence, `StatusPill` n'ayant pas
 * ces libelles francais accentues dans sa table de correspondance par defaut. */
function etatTone(etat: string): 'success' | 'neutral' | 'danger' {
  if (etat === 'ACTIF') return 'success';
  if (etat === 'ARCHIVÉ') return 'neutral';
  return 'danger';
}

export function TontineDetailModal({
  tontineId,
  onClose,
}: {
  tontineId: number | null;
  onClose: () => void;
}) {
  const { data: tontine, isLoading } = useTontineDetail(tontineId);

  return (
    <Modal
      open={tontineId !== null}
      onClose={onClose}
      title="Detail de la tontine"
      description={tontine ? `Tontine #${tontine.id}` : undefined}
      size="lg"
    >
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {tontine && !isLoading && <TontineDetailContent tontine={tontine} />}
    </Modal>
  );
}

function TontineDetailContent({ tontine }: { tontine: TontineDetail }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Description">{tontine.description}</Field>
        <Field label="Etat">
          <StatusPill status={tontine.etat} label={tontine.etat} tone={etatTone(tontine.etat)} />
        </Field>
        <Field label="Organisateur">
          {tontine.hote.username}
          <span className="ml-1.5 font-mono text-xxs text-slate-500">
            {tontine.hote.numero_telephone_masque}
          </span>
        </Field>
        <Field label="Cree le">{formatDateTime(tontine.date_creation)}</Field>
        <Field label="Membres">{tontine.membres_count}</Field>
        <Field label="Tours">{tontine.tours_count}</Field>
      </div>

      {tontine.regle && (
        <div>
          <p className="field-label mb-2">Regles de cotisation</p>
          <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <Field label="Montant par cotisation">
              <Money value={tontine.regle.montant_cotisation} />
            </Field>
            <Field label="Objectif global">
              <Money value={tontine.regle.objectif_cotisation} />
            </Field>
            <Field label="Participants max.">{tontine.regle.nombre_max}</Field>
            <Field label="Nombre de tours">{tontine.regle.nombre_tours}</Field>
            <Field label="Frequence">{tontine.regle.frequence}</Field>
            <Field label="Ordre de ramassage">{tontine.regle.ordre_ramassage}</Field>
            <Field label="Penalite">
              <Money value={tontine.regle.montant_penalite} />
            </Field>
            <Field label="Penalites automatiques">
              <Badge tone={tontine.regle.penalites_automatiques ? 'success' : 'neutral'}>
                {tontine.regle.penalites_automatiques ? 'Activees' : 'Desactivees'}
              </Badge>
            </Field>
          </div>
        </div>
      )}

      <div>
        <p className="field-label mb-2">Membres ({tontine.membres.length})</p>
        {tontine.membres.length === 0 ? (
          <p className="text-xxs text-slate-400">Aucun membre.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Membre</TH>
                <TH>Role</TH>
                <TH>Statut</TH>
                <TH>Ordre</TH>
              </TR>
            </THead>
            <TBody>
              {tontine.membres.map((membre) => (
                <TR key={membre.id}>
                  <TD>
                    <p className="font-medium text-slate-900">{membre.membre_username}</p>
                    <p className="font-mono text-xxs text-slate-500">
                      {membre.membre_numero_telephone_masque}
                    </p>
                  </TD>
                  <TD>{membre.role_membre}</TD>
                  <TD>{membre.statut_membre}</TD>
                  <TD>{membre.ordre_ramassage}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <p className="field-label mb-2">Tours ({tontine.tours.length})</p>
        {tontine.tours.length === 0 ? (
          <p className="text-xxs text-slate-400">Aucun tour enregistre.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Beneficiaire</TH>
                <TH>Montant</TH>
                <TH>Statut</TH>
                <TH>Echeance</TH>
              </TR>
            </THead>
            <TBody>
              {tontine.tours.map((tour) => (
                <TR key={tour.id}>
                  <TD>{tour.numero_du_tour}</TD>
                  <TD>{tour.beneficiaire_username}</TD>
                  <TD>
                    <Money value={tour.montant_depose} />
                  </TD>
                  <TD>{tour.statut_tour}</TD>
                  <TD>{formatDate(tour.date_echeance)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <p className="field-label mb-2">Penalites en cours ({tontine.penalites_en_cours.length})</p>
        {tontine.penalites_en_cours.length === 0 ? (
          <p className="text-xxs text-slate-400">Aucune penalite impayee.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Membre</TH>
                <TH>Type</TH>
                <TH>Montant du</TH>
                <TH>Attribuee le</TH>
              </TR>
            </THead>
            <TBody>
              {tontine.penalites_en_cours.map((penalite) => (
                <TR key={penalite.id}>
                  <TD>{penalite.user_username}</TD>
                  <TD>{penalite.type_penalite}</TD>
                  <TD>
                    <Money value={penalite.montant_due} />
                  </TD>
                  <TD>{formatDateTime(penalite.date_attribution_penalite)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
