import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, ShieldCheck, ShieldOff } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { AdminUser } from '@/lib/api/types';
import { formatAmount, formatDateTime, formatFullName, formatNumber } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuth } from '@/auth/useAuth';
import { useDebounce, usePagination } from '@/hooks';
import {
  Button,
  Card,
  DataTable,
  Input,
  Pagination,
  ReasonDialog,
  Select,
  StatusPill,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useSetUserActive, useUsersList } from '../api/users';
import { UserDetailModal } from '../components/UserDetailModal';

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'actif', label: 'Actifs' },
  { value: 'suspendu', label: 'Suspendus' },
];

export default function UsersPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [inspected, setInspected] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState<AdminUser | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const canSuspend = can(PERMISSIONS.USER_SUSPEND);

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      statut: statut || undefined,
    }),
    [page, pageSize, debouncedSearch, statut],
  );

  const { data, isLoading, isError, error, isFetching } = useUsersList(params);
  const setActive = useSetUserActive();

  const handleConfirm = async (reason: string) => {
    if (!pending) return;
    try {
      await setActive.mutateAsync({
        id: pending.id,
        isActive: !pending.is_active,
        reason,
      });
      toast.success(
        pending.is_active ? 'Compte suspendu' : 'Compte reactive',
        formatFullName(pending),
      );
      setPending(null);
    } catch (caught) {
      toast.error('Action refusee', errorMessage(caught));
    }
  };

  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        accessorKey: 'username',
        header: 'Client',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{formatFullName(row.original)}</p>
            <p className="font-mono text-xxs text-slate-500">{row.original.username}</p>
          </div>
        ),
      },
      {
        accessorKey: 'numero_telephone_masque',
        header: 'Telephone',
        enableSorting: false,
        cell: ({ row }) => (
          // Masque par le serveur : la valeur en clair n'existe pas dans cette
          // reponse. Voir la fiche client pour une revelation tracee.
          <span className="tabular text-slate-600">
            {row.original.numero_telephone_masque}
          </span>
        ),
      },
      {
        accessorKey: 'solde_courant',
        header: 'Solde',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-800">
            {formatAmount(row.original.solde_courant)}
          </span>
        ),
      },
      {
        accessorKey: 'tontines_count',
        header: 'Tontines',
        cell: ({ row }) => (
          <span className="tabular text-slate-600">
            {formatNumber(row.original.tontines_count)}
          </span>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Statut',
        cell: ({ row }) => (
          <StatusPill status={row.original.is_active ? 'active' : 'suspended'} />
        ),
      },
      {
        accessorKey: 'date_joined',
        header: 'Inscription',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDateTime(row.original.date_joined)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          if (!canSuspend) return null;
          const client = row.original;
          return (
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                variant={client.is_active ? 'ghost' : 'outline'}
                onClick={(event) => {
                  event.stopPropagation();
                  setPending(client);
                }}
                icon={
                  client.is_active ? (
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  )
                }
              >
                {client.is_active ? 'Suspendre' : 'Reactiver'}
              </Button>
            </div>
          );
        },
      },
    ],
    [canSuspend],
  );

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        description="Comptes clients. Les donnees personnelles sont masquees par defaut."
      />

      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <div className="w-72">
            <Input
              placeholder="Nom, identifiant, numero complet…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              icon={<Search className="h-3.5 w-3.5" aria-hidden />}
            />
          </div>
          <div className="w-44">
            <Select
              options={STATUS_OPTIONS}
              value={statut}
              onChange={(event) => {
                setStatut(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <p className="ml-auto text-xxs text-slate-500">
            La recherche par numero exige le numero complet.
          </p>
        </div>

        <DataTable
          data={data?.results ?? []}
          columns={columns}
          loading={isLoading}
          error={isError ? errorMessage(error) : null}
          emptyTitle="Aucun utilisateur"
          onRowClick={(row) => setInspected(row)}
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

      <UserDetailModal
        user={inspected}
        onClose={() => setInspected(null)}
        onToggleActive={(client) => setPending(client)}
      />

      <ReasonDialog
        open={pending !== null}
        title={pending?.is_active ? 'Suspendre le compte' : 'Reactiver le compte'}
        message={
          pending && (
            <p>
              Client concerne : <strong>{formatFullName(pending)}</strong> (
              <span className="font-mono text-xxs">{pending.username}</span>).
              {pending.is_active && ' Ses sessions en cours seront revoquees.'}
            </p>
          )
        }
        confirmLabel="Confirmer"
        destructive={pending?.is_active ?? true}
        loading={setActive.isPending}
        onConfirm={(reason) => void handleConfirm(reason)}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
