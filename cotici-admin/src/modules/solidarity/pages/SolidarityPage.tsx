import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { Solidarity } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { useDebounce, usePagination } from '@/hooks';
import { Card, DataTable, Input, Money, Pagination, Select, StatusPill } from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useSolidarityList } from '../api/solidarity';
import { SolidarityDetailModal } from '../components/SolidarityDetailModal';

const ETAT_OPTIONS = [
  { value: 'ACTIF', label: 'Actif' },
  { value: 'ARCHIVÉ', label: 'Archive' },
  { value: 'SUPPRIMÉ', label: 'Supprime' },
];

const OBJECTIF_OPTIONS = [
  { value: 'true', label: 'Objectif atteint' },
  { value: 'false', label: 'Objectif non atteint' },
];

const VERSEMENT_OPTIONS = [
  { value: 'true', label: 'Verse' },
  { value: 'false', label: 'Non verse' },
];

/** Petite barre de progression (0-100), sans dependance externe. */
function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand" style={{ width: `${clamped}%` }} />
      </div>
      <span className="tabular text-xxs text-slate-500">{clamped.toFixed(0)} %</span>
    </div>
  );
}

export default function SolidarityPage() {
  const [search, setSearch] = useState('');
  const [etat, setEtat] = useState('');
  const [objectifAtteint, setObjectifAtteint] = useState('');
  const [versementEffectue, setVersementEffectue] = useState('');
  const [selected, setSelected] = useState<Solidarity | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      etat: etat || undefined,
      objectif_atteint: objectifAtteint || undefined,
      versement_effectue: versementEffectue || undefined,
    }),
    [page, pageSize, debouncedSearch, etat, objectifAtteint, versementEffectue],
  );

  const { data, isLoading, isError, error, isFetching } = useSolidarityList(params);

  const columns = useMemo<ColumnDef<Solidarity, unknown>[]>(
    () => [
      {
        id: 'organisateur',
        header: 'Organisateur',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{row.original.hote.username}</p>
            <p className="font-mono text-xxs text-slate-500">
              {row.original.hote.numero_telephone_masque}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'beneficiaire_telephone_masque',
        header: 'Beneficiaire',
        cell: ({ row }) => (
          // Donnee personnelle d'un tiers : masquee par le backend.
          <span className="font-mono text-xxs text-slate-600">
            {row.original.beneficiaire_telephone_masque}
          </span>
        ),
      },
      {
        accessorKey: 'objectif_cotisation',
        header: 'Objectif',
        cell: ({ row }) => <Money value={row.original.objectif_cotisation} />,
      },
      {
        accessorKey: 'montant_collecte',
        header: 'Collecte',
        cell: ({ row }) => <Money value={row.original.montant_collecte} />,
      },
      {
        id: 'progression',
        header: 'Progression',
        enableSorting: false,
        cell: ({ row }) => <ProgressBar percent={row.original.progression_pct} />,
      },
      {
        id: 'verse',
        header: 'Verse',
        cell: ({ row }) =>
          row.original.versement_effectue ? (
            <Money value={row.original.montant_verse} />
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        accessorKey: 'etat',
        header: 'Etat',
        cell: ({ row }) => <StatusPill status={row.original.etat} />,
      },
      {
        accessorKey: 'date_creation',
        header: 'Creee le',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDate(row.original.date_creation)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Solidarite"
        description="Suivi des collectes solidaires : progression de la cotisation et versement au beneficiaire. Lecture seule."
      />

      <Card flush>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
          <div className="w-64">
            <Input
              placeholder="Organisateur, beneficiaire…"
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
          <div className="w-52">
            <Select
              placeholder="Objectif : tous"
              options={OBJECTIF_OPTIONS}
              value={objectifAtteint}
              onChange={(event) => {
                setObjectifAtteint(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-48">
            <Select
              placeholder="Versement : tous"
              options={VERSEMENT_OPTIONS}
              value={versementEffectue}
              onChange={(event) => {
                setVersementEffectue(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <DataTable
          data={data?.results ?? []}
          columns={columns}
          loading={isLoading}
          error={isError ? errorMessage(error) : null}
          enableSorting={false}
          onRowClick={setSelected}
          emptyTitle="Aucune collecte solidaire"
          emptyDescription="Aucune collecte ne correspond aux filtres selectionnes."
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

      <SolidarityDetailModal solidarity={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
