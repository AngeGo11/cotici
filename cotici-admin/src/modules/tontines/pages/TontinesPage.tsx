import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, RotateCcw, Search, Trash2, Users2 } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { TontineListItem, TontineModerationAction } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
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
import { useModerateTontine, useTontineList } from '../api/tontines';
import { TontineDetailModal } from '../components/TontineDetailModal';

type PendingAction = {
  action: TontineModerationAction;
  tontine: TontineListItem;
} | null;

const ETAT_OPTIONS = [
  { value: 'ACTIF', label: 'Actif' },
  { value: 'ARCHIVÉ', label: 'Archive' },
  { value: 'SUPPRIMÉ', label: 'Supprime' },
];

const ACTION_LABELS: Record<TontineModerationAction, string> = {
  archive: 'Archiver la tontine',
  restore: 'Restaurer la tontine',
  delete: 'Supprimer la tontine',
};

function etatTone(etat: string): 'success' | 'neutral' | 'danger' {
  if (etat === 'ACTIF') return 'success';
  if (etat === 'ARCHIVÉ') return 'neutral';
  return 'danger';
}

/** Actions de moderation pertinentes selon l'etat courant de la tontine. */
function availableActions(etat: string): TontineModerationAction[] {
  if (etat === 'ACTIF') return ['archive', 'delete'];
  if (etat === 'ARCHIVÉ') return ['restore', 'delete'];
  return ['restore'];
}

export default function TontinesPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [etat, setEtat] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      etat: etat || undefined,
    }),
    [page, pageSize, debouncedSearch, etat],
  );

  const { data, isLoading, isError, error, isFetching } = useTontineList(params);
  const moderate = useModerateTontine();

  const handleConfirm = async (reason: string) => {
    if (!pending) return;
    try {
      await moderate.mutateAsync({ id: pending.tontine.id, action: pending.action, reason });
      toast.success(ACTION_LABELS[pending.action], pending.tontine.description);
      setPending(null);
    } catch (caught) {
      toast.error('Action refusee', errorMessage(caught));
    }
  };

  const columns = useMemo<ColumnDef<TontineListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'description',
        header: 'Tontine',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{row.original.description}</p>
            <p className="text-xxs text-slate-500">
              {row.original.hote.username}
              <span className="ml-1 font-mono">{row.original.hote.numero_telephone_masque}</span>
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'etat',
        header: 'Etat',
        cell: ({ row }) => (
          <StatusPill
            status={row.original.etat}
            label={row.original.etat}
            tone={etatTone(row.original.etat)}
          />
        ),
      },
      {
        accessorKey: 'membres_count',
        header: 'Membres',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-slate-600">
            <Users2 className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            {row.original.membres_count}
          </span>
        ),
      },
      {
        accessorKey: 'tours_count',
        header: 'Tours',
        cell: ({ row }) => <span className="text-slate-600">{row.original.tours_count}</span>,
      },
      {
        accessorKey: 'date_creation',
        header: 'Creee le',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDateTime(row.original.date_creation)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <IfPermission permissions={[PERMISSIONS.TONTINE_MODERATE]}>
            <div className="flex items-center justify-end gap-1">
              {availableActions(row.original.etat).map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === 'delete' ? 'ghost' : 'outline'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPending({ action, tontine: row.original });
                  }}
                  icon={
                    action === 'archive' ? (
                      <Archive className="h-3.5 w-3.5" aria-hidden />
                    ) : action === 'restore' ? (
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    )
                  }
                >
                  {action === 'archive' ? 'Archiver' : action === 'restore' ? 'Restaurer' : 'Supprimer'}
                </Button>
              ))}
            </div>
          </IfPermission>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Tontines"
        description="Tontines de groupe : consultation et moderation. Les cagnottes et tontines solidaires sont gerees sur leurs propres ecrans."
      />

      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <Input
                placeholder="Description, organisateur, telephone…"
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
                placeholder="Tous les etats"
                options={ETAT_OPTIONS}
                value={etat}
                onChange={(event) => {
                  setEtat(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        <DataTable
          data={data?.results ?? []}
          columns={columns}
          loading={isLoading}
          error={isError ? errorMessage(error) : null}
          enableSorting={false}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyTitle="Aucune tontine"
          emptyDescription="Aucune tontine de groupe ne correspond aux filtres selectionnes."
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
        title={pending ? ACTION_LABELS[pending.action] : ''}
        message={
          pending && (
            <p>
              Tontine concernee : <strong>{pending.tontine.description}</strong> (organisateur{' '}
              <span className="font-mono text-xxs">{pending.tontine.hote.username}</span>).
            </p>
          )
        }
        confirmLabel="Confirmer"
        destructive={pending?.action !== 'restore'}
        loading={moderate.isPending}
        onConfirm={(reason) => void handleConfirm(reason)}
        onClose={() => setPending(null)}
      />

      <TontineDetailModal tontineId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
