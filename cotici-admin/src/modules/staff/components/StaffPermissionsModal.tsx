import { Check, Minus } from 'lucide-react';
import type { StaffMember } from '@/lib/api/types';
import { formatFullName } from '@/lib/format';
import { PERMISSION_GROUPS, PERMISSION_LABELS } from '@/lib/permissions';
import { Button, Modal } from '@/components/ui';

/** Consultation des permissions effectives d'un compte staff. */
export function StaffPermissionsModal({
  member,
  onClose,
}: {
  member: StaffMember | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title="Permissions du compte"
      description={member ? `${formatFullName(member)} — role ${member.role}` : undefined}
      size="lg"
      footer={
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {member && (
        <div className="space-y-4">
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xxs text-slate-600">
            Les permissions sont derivees du role attribue cote serveur. Cet ecran est en
            lecture seule : la modification s’effectue via la gestion des roles.
          </p>

          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="field-label">{group.label}</p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {group.permissions.map((permission) => {
                  const granted = member.permissions.includes(permission);
                  return (
                    <li
                      key={permission}
                      className="flex items-center gap-2 rounded border border-slate-100 px-2 py-1"
                    >
                      {granted ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                      ) : (
                        <Minus className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                      )}
                      <span
                        className={granted ? 'text-[13px] text-slate-800' : 'text-[13px] text-slate-400'}
                      >
                        {PERMISSION_LABELS[permission]}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-slate-400">
                        {permission}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
