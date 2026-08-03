import type { AuditEntry } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { Button, Copyable, Modal } from '@/components/ui';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="text-[13px] text-slate-800">{children ?? '—'}</div>
    </div>
  );
}

export function AuditDetailModal({
  entry,
  onClose,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={entry !== null}
      onClose={onClose}
      title="Detail de l’entree d’audit"
      description={entry ? `Enregistrement ${entry.source} #${entry.id}` : undefined}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {entry && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Horodatage">{formatDateTime(entry.created_at)}</Field>
            <Field label="Action">
              <span className="font-mono text-xxs">{entry.action}</span>
            </Field>
            <Field label="Operateur">{entry.actor ?? 'systeme'}</Field>
            <Field label="Role">{entry.actor_role ?? '—'}</Field>
            <Field label="Cible">
              {entry.target_type
                ? `${entry.target_type}${entry.target_id ? ` #${entry.target_id}` : ''}`
                : '—'}
            </Field>
            <Field label="Adresse IP">
              {entry.ip_address ? <Copyable value={entry.ip_address} /> : '—'}
            </Field>
          </div>

          <Field label="Motif">
            {entry.reason ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[13px]">
                {entry.reason}
              </p>
            ) : (
              <span className="text-slate-400">Aucun motif enregistre</span>
            )}
          </Field>

          {entry.user_agent && (
            <Field label="Agent utilisateur">
              <span className="break-all font-mono text-xxs text-slate-600">
                {entry.user_agent}
              </span>
            </Field>
          )}

          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <Field label="Donnees associees">
              <pre className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-xxs text-slate-100">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
