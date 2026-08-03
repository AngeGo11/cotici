import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { SavingsListItem } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useDebounce, usePagination } from '@/hooks';
import { Card, DataTable, Input, Money, Pagination, Select, StatusPill } from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useSavingsList } from '../api/savings';
import { SavingsDetailModal } from '../components/SavingsDetailModal';

const ETAT_OPTIONS = [
  { value: 'ACTIF', label: 'Actif' },
  { value: 'ARCHIVÉ', label: 'Archive' },
  { value: 'SUPPRIMÉ', label: 'Supprime' },
];

function ProgressCell({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand" style={{ width: `${clamped}%` }} />
      </div>
      <span className="tabular text-xxs text-slate-600">{value.toFixed(0)} %</span>
    </div>
  );
}

export default function SavingsPage() {
  const [search, setSearch] = useState('');
  const [etat, setEtat] = useState('');
  const [selected, setSelected] = useState<SavingsListItem | null>(null);
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

  const { data, isLoading, isError, error, isFetching } = useSavingsList(params);

  const columns = useMemo<ColumnDef<SavingsListItem, unknown>[]>(
    () => [
      {
        id: 'titulaire',
        header: 'Titulaire',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{row.original.titulaire.nom_complet}</p>
            <p className="text-xxs text-slate-500">
              {row.original.titulaire.numero_telephone_masque}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'nom_projet',
        header: 'Libelle',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="text-slate-900">{row.original.nom_projet}</p>
            {row.original.categorie && (
              <p className="text-xxs text-slate-500">{row.original.categorie}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'objectif_cotisation',
        header: 'Objectif',
        cell: ({ row }) => <Money value={row.original.objectif_cotisation} />,
      },
      {
        accessorKey: 'cumul_verse',
        header: 'Cumul verse',
        cell: ({ row }) => <Money value={row.original.cumul_verse} />,
      },
      {
        accessorKey: 'progression',
        header: 'Progression',
        enableSorting: false,
        cell: ({ row }) => <ProgressCell value={row.original.progression} />,
      },
      {
        accessorKey: 'etat',
        header: 'Statut',
        cell: ({ row }) => (
          <StatusPill
            status={row.original.etat === 'ACTIF' ? 'active' : 'inactive'}
            label={row.original.etat}
          />
        ),
      },
      {
        accessorKey: 'echeance',
        header: 'Echeance',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {row.original.echeance ? formatDate(row.original.echeance) : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Epargnes"
        description="Supervision des plans d'epargne personnels et de leurs echeances. Lecture seule."
      />

      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <Input
                placeholder="Titulaire, libelle du projet…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                icon={<Search className="h-3.5 w-3.5" aria-hidden />}
              />
            </div>
            <div className="w-40">
              <Select
                value={etat}
                placeholder="Tous les statuts"
                options={ETAT_OPTIONS}
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
          onRowClick={setSelected}
          emptyTitle="Aucune epargne"
          emptyDescription="Aucune epargne personnelle ne correspond aux filtres selectionnes."
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

      <SavingsDetailModal epargne={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
