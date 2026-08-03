import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { StaffMember } from '@/lib/api/types';
import { formatDateTime, formatFullName, maskEmail } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuth } from '@/auth/useAuth';
import { useDebounce, usePagination } from '@/hooks';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Pagination,
  ReasonDialog,
  StatusPill,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useResetStaffTotp, useSetStaffActive, useStaffList } from '../api/staff';
import { StaffPermissionsModal } from '../components/StaffPermissionsModal';

type PendingAction =
  | { type: 'toggle-active'; member: StaffMember }
  | { type: 'reset-totp'; member: StaffMember }
  | null;

export default function StaffPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [inspected, setInspected] = useState<StaffMember | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const canManage = can(PERMISSIONS.STAFF_MANAGE);

  const params = useMemo(
    () => ({ page, page_size: pageSize, search: debouncedSearch || undefined }),
    [page, pageSize, debouncedSearch],
  );

  const { data, isLoading, isError, error, isFetching } = useStaffList(params);
  const setActive = useSetStaffActive();
  const resetTotp = useResetStaffTotp();

  const handleConfirm = async (reason: string) => {
    if (!pending) return;
    try {
      if (pending.type === 'toggle-active') {
        await setActive.mutateAsync({
          id: pending.member.id,
          isActive: !pending.member.is_active,
          reason,
        });
        toast.success(
          pending.member.is_active ? 'Compte desactive' : 'Compte reactive',
          formatFullName(pending.member),
        );
      } else {
        await resetTotp.mutateAsync({ id: pending.member.id, reason });
        toast.success(
          'Double authentification reinitialisee',
          `${formatFullName(pending.member)} devra la reconfigurer a sa prochaine connexion.`,
        );
      }
      setPending(null);
    } catch (caught) {
      toast.error('Action refusee', errorMessage(caught));
    }
  };

  const columns = useMemo<ColumnDef<StaffMember, unknown>[]>(
    () => [
      {
        accessorKey: 'username',
        header: 'Compte',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">
              {formatFullName(row.original)}
              {row.original.username === user?.username && (
                <span className="ml-1.5 text-xxs font-normal text-slate-400">(vous)</span>
              )}
            </p>
            <p className="font-mono text-xxs text-slate-500">{row.original.username}</p>
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'E-mail',
        cell: ({ row }) => (
          // Donnee personnelle : masquee par defaut dans les listes.
          <span className="text-slate-600">{maskEmail(row.original.email)}</span>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <Badge tone="brand">{row.original.role || 'staff'}</Badge>,
      },
      {
        id: 'permissions',
        header: 'Permissions',
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setInspected(row.original);
            }}
            className="text-xxs text-brand-dark underline-offset-2 hover:underline"
          >
            {row.original.permissions.length} accordee(s)
          </button>
        ),
      },
      {
        accessorKey: 'totp_enabled',
        header: '2FA',
        cell: ({ row }) =>
          row.original.totp_enabled ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="danger">Non configuree</Badge>
          ),
      },
      {
        accessorKey: 'is_active',
        header: 'Statut',
        cell: ({ row }) => (
          <StatusPill status={row.original.is_active ? 'active' : 'inactive'} />
        ),
      },
      {
        accessorKey: 'last_login',
        header: 'Derniere connexion',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDateTime(row.original.last_login)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const member = row.original;
          const isSelf = member.username === user?.username;
          if (!canManage) return null;

          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={isSelf}
                title={isSelf ? 'Action indisponible sur votre propre compte' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  setPending({ type: 'reset-totp', member });
                }}
                icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />}
              >
                2FA
              </Button>
              <Button
                size="sm"
                variant={member.is_active ? 'ghost' : 'outline'}
                disabled={isSelf}
                title={isSelf ? 'Action indisponible sur votre propre compte' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  setPending({ type: 'toggle-active', member });
                }}
                icon={
                  member.is_active ? (
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  )
                }
              >
                {member.is_active ? 'Desactiver' : 'Reactiver'}
              </Button>
            </div>
          );
        },
      },
    ],
    [canManage, user?.username],
  );

  const dialogTitle =
    pending?.type === 'reset-totp'
      ? 'Reinitialiser la double authentification'
      : pending?.member.is_active
        ? 'Desactiver le compte'
        : 'Reactiver le compte';

  return (
    <div>
      <PageHeader
        title="Comptes staff"
        description="Gestion des acces au back-office. Chaque action est journalisee."
      />

      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="w-64">
            <Input
              placeholder="Nom, identifiant, role…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              icon={<Search className="h-3.5 w-3.5" aria-hidden />}
            />
          </div>
          {!canManage && (
            <p className="text-xxs text-slate-500">
              Consultation seule : la permission staff.manage est requise pour agir.
            </p>
          )}
        </div>

        <DataTable
          data={data?.results ?? []}
          columns={columns}
          loading={isLoading}
          error={isError ? errorMessage(error) : null}
          emptyTitle="Aucun compte staff"
          footer={
            <Pagination
              page={page}
              pageSize={pageSize}
              count={data?.count ?? 0}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              loading={isFetching}
            />
          }
        />
      </Card>

      <ReasonDialog
        open={pending !== null}
        title={dialogTitle}
        message={
          pending && (
            <p>
              Compte concerne : <strong>{formatFullName(pending.member)}</strong> (
              <span className="font-mono text-xxs">{pending.member.username}</span>).
            </p>
          )
        }
        confirmLabel="Confirmer"
        destructive={pending?.type === 'toggle-active' ? pending.member.is_active : true}
        loading={setActive.isPending || resetTotp.isPending}
        onConfirm={(reason) => void handleConfirm(reason)}
        onClose={() => setPending(null)}
      />

      <StaffPermissionsModal member={inspected} onClose={() => setInspected(null)} />
    </div>
  );
}
