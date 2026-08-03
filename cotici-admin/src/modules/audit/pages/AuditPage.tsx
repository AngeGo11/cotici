import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { AuditEntry } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useDebounce, usePagination } from '@/hooks';
import {
  Badge,
  Card,
  DataTable,
  DateRangePicker,
  EMPTY_RANGE,
  Input,
  Pagination,
  type DateRange,
} from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useAuditList } from '../api/audit';
import { AuditDetailModal } from '../components/AuditDetailModal';

/** Colore les actions destructrices pour les reperer d'un coup d'oeil. */
function actionTone(action: string) {
  const lowered = action.toLowerCase();
  if (/(delete|suspend|force|reject|reverse|adjust)/.test(lowered)) return 'danger' as const;
  if (/(approve|create|resolve)/.test(lowered)) return 'success' as const;
  if (/(login|logout|view|read|reveal)/.test(lowered)) return 'neutral' as const;
  return 'info' as const;
}

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      date_from: range.from || undefined,
      date_to: range.to || undefined,
      ordering: '-created_at',
    }),
    [page, pageSize, debouncedSearch, range],
  );

  const { data, isLoading, isError, error, isFetching } = useAuditList(params);

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Horodatage',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'actor',
        header: 'Operateur',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{row.original.actor ?? 'systeme'}</p>
            {row.original.actor_role && (
              <p className="text-xxs text-slate-500">{row.original.actor_role}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ row }) => (
          <Badge tone={actionTone(row.original.action)}>
            <span className="font-mono">{row.original.action}</span>
          </Badge>
        ),
      },
      {
        id: 'target',
        header: 'Cible',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.target_type ? (
            <span className="font-mono text-xxs text-slate-600">
              {row.original.target_type}
              {/* Les entrees du journal metier designent une ressource sans
                  identifiant numerique : on n'affiche "#id" que s'il existe. */}
              {row.original.target_id ? `#${row.original.target_id}` : ''}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        accessorKey: 'reason',
        header: 'Motif',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="line-clamp-1 max-w-xs text-slate-600" title={row.original.reason ?? ''}>
            {row.original.reason ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'ip_address',
        header: 'IP',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-xxs text-slate-500">
            {row.original.ip_address ?? '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Journal d’audit"
        description="Trace immuable des actions realisees depuis le back-office. Lecture seule."
      />

      <Card flush>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-3">
          <div className="w-64">
            <Input
              placeholder="Operateur, action, cible…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              icon={<Search className="h-3.5 w-3.5" aria-hidden />}
            />
          </div>
          <DateRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />
        </div>

        <DataTable
          data={data?.results ?? []}
          columns={columns}
          loading={isLoading}
          error={isError ? errorMessage(error) : null}
          enableSorting={false}
          onRowClick={setSelected}
          emptyTitle="Aucune entree d’audit"
          emptyDescription="Aucune action ne correspond aux filtres selectionnes."
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

      <AuditDetailModal entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
