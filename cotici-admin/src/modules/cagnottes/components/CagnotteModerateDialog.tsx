import type { CagnotteListItem, CagnotteModerationAction } from '@/lib/api/types';
import { ReasonDialog } from '@/components/ui';

export interface PendingModeration {
  cagnotte: CagnotteListItem;
  action: CagnotteModerationAction;
}

const DIALOG_COPY: Record<CagnotteModerationAction, { title: string; confirmLabel: string; destructive: boolean }> = {
  archive: { title: 'Archiver la cagnotte', confirmLabel: 'Archiver', destructive: true },
  restore: { title: 'Restaurer la cagnotte', confirmLabel: 'Restaurer', destructive: false },
  delete: { title: 'Supprimer la cagnotte', confirmLabel: 'Supprimer', destructive: true },
};

/** Boite de dialogue de moderation (archiver / restaurer / supprimer), motif obligatoire. */
export function CagnotteModerateDialog({
  pending,
  loading,
  onConfirm,
  onClose,
}: {
  pending: PendingModeration | null;
  loading: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const copy = pending ? DIALOG_COPY[pending.action] : null;

  return (
    <ReasonDialog
      open={pending !== null}
      title={copy?.title ?? ''}
      message={
        pending && (
          <p>
            Cagnotte concernee : <strong>{pending.cagnotte.nom_cagnotte}</strong> (organisateur{' '}
            <span className="font-mono text-xxs">
              {pending.cagnotte.organisateur.numero_telephone_masque}
            </span>
            ).
          </p>
        )
      }
      confirmLabel={copy?.confirmLabel ?? 'Confirmer'}
      destructive={copy?.destructive ?? true}
      loading={loading}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
