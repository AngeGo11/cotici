import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { Dispute, DisputeResolutionOutcome } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useDebounce, usePagination } from '@/hooks';
import {
  Card,
  DataTable,
  Pagination,
  Select,
  StatusPill,
  Input,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useDisputeList, useResolveDispute } from '../api/disputes';
import { DisputeDetailModal } from '../components/DisputeDetailModal';
import { ResolveDisputeDialog } from '../components/ResolveDisputeDialog';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, STATUS_OPTIONS, statusToneAndLabel } from '../components/constants';

export default function DisputesPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [resolving, setResolving] = useState<Dispute | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      status: status || undefined,
      category: category || undefined,
    }),
    [page, pageSize, debouncedSearch, status, category],
  );

  const { data, isLoading, isError, error, isFetching } = useDisputeList(params);
  const resolveDispute = useResolveDispute();

  const handleResolve = async (payload: {
    resolution: DisputeResolutionOutcome;
    decision: string;
    reason: string;
  }) => {
    if (!resolving) return;
    try {
      await resolveDispute.mutateAsync({ id: resolving.id, payload });
      toast.success(
        payload.resolution === 'resolu' ? 'Litige resolu' : 'Litige rejete',
        `Litige #${resolving.id} — ${resolving.subject}`,
      );
      setResolving(null);
      setSelected(null);
    } catch (caught) {
      toast.error('Resolution refusee', errorMessage(caught));
    }
  };

  const columns = useMemo<ColumnDef<Dispute, unknown>[]>(
    () => [
      {
        accessorKey: 'opened_at',
        header: 'Ouvert le',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDateTime(row.original.opened_at)}
          </span>
        ),
      },
      {
        id: 'subject',
        header: 'Objet',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{row.original.subject}</p>
            <p className="text-xxs text-slate-500">{CATEGORY_LABELS[row.original.category]}</p>
          </div>
        ),
      },
      {
        id: 'opened_by',
        header: 'Ouvert par',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.opened_by ? (
            <div className="leading-tight">
              <p className="text-slate-800">{row.original.opened_by.username}</p>
              <p className="font-mono text-xxs text-slate-500">
                {row.original.opened_by.numero_telephone_masque}
              </p>
            </div>
          ) : (
            <span className="text-slate-400">Compte supprime</span>
          ),
      },
      {
        accessorKey: 'status',
        header: 'Statut',
        cell: ({ row }) => {
          const { label, tone } = statusToneAndLabel(row.original.status);
          return <StatusPill status={row.original.status} label={label} tone={tone} />;
        },
      },
      {
        accessorKey: 'resolved_at',
        header: 'Resolu le',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {row.original.resolved_at ? formatDateTime(row.original.resolved_at) : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Litiges"
        description="File des reclamations clients : cotisations non creditees, transactions contestees, conflits entre membres."
      />

      <Card flush>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-64">
              <Input
                placeholder="Objet, description, ouvreur…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                icon={<Search className="h-3.5 w-3.5" aria-hidden />}
              />
            </div>
            <div className="w-48">
              <Select
                placeholder="Tous les statuts"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-56">
              <Select
                placeholder="Toutes les categories"
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
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
          onRowClick={setSelected}
          emptyTitle="Aucun litige"
          emptyDescription="Aucun litige ne correspond aux filtres selectionnes."
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

      <DisputeDetailModal
        dispute={selected}
        onClose={() => setSelected(null)}
        onResolve={(dispute) => setResolving(dispute)}
      />

      <ResolveDisputeDialog
        dispute={resolving}
        loading={resolveDispute.isPending}
        onConfirm={(payload) => void handleResolve(payload)}
        onClose={() => setResolving(null)}
      />
    </div>
  );
}
