import { useEffect, useState } from 'react';
import { Eye, ShieldCheck, ShieldOff } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { AdminUser } from '@/lib/api/types';
import { formatAmount, formatDateTime, formatFullName, formatNumber } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
import {
  Button,
  Modal,
  ReasonDialog,
  Skeleton,
  StatusPill,
  useToast,
} from '@/components/ui';
import { useRevealPii, useUserDetail } from '../api/users';

export interface UserDetailModalProps {
  user: AdminUser | null;
  onClose: () => void;
  onToggleActive: (user: AdminUser) => void;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="text-[13px] text-slate-800">{value}</p>
    </div>
  );
}

/**
 * Fiche client. Les donnees personnelles restent masquees tant que
 * l'operateur n'a pas explicitement demande leur revelation : la valeur en
 * clair n'est affichee qu'apres un appel motive, et disparait a la fermeture
 * de la fiche (elle n'est jamais mise en cache).
 */
export function UserDetailModal({ user, onClose, onToggleActive }: UserDetailModalProps) {
  const toast = useToast();
  const { data, isLoading } = useUserDetail(user?.id ?? null);
  const revealPii = useRevealPii();
  const [revealed, setRevealed] = useState<{ phone: string; email: string } | null>(null);
  const [askingReason, setAskingReason] = useState(false);

  // Changer de client (ou fermer) doit repartir de l'etat masque.
  useEffect(() => {
    setRevealed(null);
    setAskingReason(false);
  }, [user?.id]);

  if (!user) return null;

  const detail = data ?? user;

  const handleReveal = async (reason: string) => {
    try {
      const result = await revealPii.mutateAsync({ id: user.id, reason });
      setRevealed({ phone: result.numero_telephone, email: result.email });
      setAskingReason(false);
      toast.success('Donnees revelees', 'Cet acces a ete journalise.');
    } catch (caught) {
      toast.error('Revelation refusee', errorMessage(caught));
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={formatFullName(user)}
        description={
          <span className="font-mono text-xxs text-slate-500">{user.username}</span>
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            <IfPermission permissions={[PERMISSIONS.USER_PII_REVEAL]}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAskingReason(true)}
                disabled={revealed !== null}
                icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
              >
                {revealed ? 'Donnees revelees' : 'Reveler les donnees personnelles'}
              </Button>
            </IfPermission>
            <IfPermission permissions={[PERMISSIONS.USER_SUSPEND]}>
              <Button
                size="sm"
                variant={user.is_active ? 'ghost' : 'outline'}
                onClick={() => onToggleActive(user)}
                icon={
                  user.is_active ? (
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  )
                }
              >
                {user.is_active ? 'Suspendre le compte' : 'Reactiver le compte'}
              </Button>
            </IfPermission>
          </div>
        }
      >
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field
              label="Statut"
              value={<StatusPill status={detail.is_active ? 'active' : 'inactive'} />}
            />
            <Field
              label="Telephone"
              value={
                <span className="tabular">
                  {revealed?.phone ?? detail.numero_telephone_masque}
                </span>
              }
            />
            <Field label="E-mail" value={revealed?.email ?? detail.email_masque} />
            <Field label="Solde du portefeuille" value={formatAmount(detail.solde_courant)} />
            <Field label="Inscription" value={formatDateTime(detail.date_joined)} />
            <Field label="Derniere connexion" value={formatDateTime(detail.last_login)} />
            {data && (
              <>
                <Field
                  label="Tontines (membre)"
                  value={formatNumber(data.tontines_count)}
                />
                <Field
                  label="Tontines (organisateur)"
                  value={formatNumber(data.tontines_hebergees)}
                />
                <Field label="Epargnes" value={formatNumber(data.epargnes_count)} />
                <Field
                  label="Transactions"
                  value={formatNumber(data.transactions_count)}
                />
              </>
            )}
          </div>
        )}
      </Modal>

      <ReasonDialog
        open={askingReason}
        title="Reveler les donnees personnelles"
        message={
          <p>
            Cet acces sera journalise nominativement, avec le motif saisi. Ne
            l’utilisez que pour une demande legitime et documentee.
          </p>
        }
        confirmLabel="Reveler"
        destructive
        loading={revealPii.isPending}
        onConfirm={(reason) => void handleReveal(reason)}
        onClose={() => setAskingReason(false)}
      />
    </>
  );
}
