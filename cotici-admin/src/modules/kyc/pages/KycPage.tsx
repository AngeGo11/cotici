import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { KycSubmission } from '@/lib/api/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useDebounce, usePagination } from '@/hooks';
import {
  Badge,
  Card,
  DataTable,
  Input,
  Pagination,
  Select,
} from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useKycQueue } from '../api/kyc';
import { KycReviewModal } from '../components/KycReviewModal';
import { KycStatusBadge } from '../components/KycStatusBadge';

const STATUT_OPTIONS = [
  { value: 'EN_ATTENTE', label: 'En attente' },
  { value: 'EN_EXAMEN', label: 'En examen' },
  { value: 'APPROUVE', label: 'Approuves' },
  { value: 'REJETE', label: 'Rejetes' },
  { value: '', label: 'Tous les statuts' },
];

const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous les niveaux' },
  { value: 'NIVEAU_1', label: 'Niveau 1' },
  { value: 'NIVEAU_2', label: 'Niveau 2' },
  { value: 'NIVEAU_3', label: 'Niveau 3' },
];

export default function KycPage() {
  const [search, setSearch] = useState('');
  // La file s'ouvre sur les dossiers a traiter : c'est le travail du jour.
  const [statut, setStatut] = useState('EN_ATTENTE');
  const [niveau, setNiveau] = useState('');
  const [inspected, setInspected] = useState<KycSubmission | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      statut: statut || undefined,
      niveau: niveau || undefined,
    }),
    [page, pageSize, debouncedSearch, statut, niveau],
  );

  const { data, isLoading, isError, error, isFetching } = useKycQueue(params);

  const columns = useMemo<ColumnDef<KycSubmission, unknown>[]>(
    () => [
      {
        accessorKey: 'nom_complet_declare',
        header: 'Client',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">
              {row.original.nom_complet_declare || '—'}
            </p>
            <p className="font-mono text-xxs text-slate-500">
              {row.original.client_username}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'client_telephone_masque',
        header: 'Telephone',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular text-slate-600">
            {row.original.client_telephone_masque}
          </span>
        ),
      },
      {
        accessorKey: 'type_piece',
        header: 'Piece',
        cell: ({ row }) => <Badge tone="neutral">{row.original.type_piece}</Badge>,
      },
      {
        accessorKey: 'niveau_demande',
        header: 'Niveau',
        cell: ({ row }) => (
          <span className="text-slate-600">
            {row.original.niveau_accorde || row.original.niveau_demande}
          </span>
        ),
      },
      {
        accessorKey: 'statut',
        header: 'Statut',
        cell: ({ row }) => <KycStatusBadge statut={row.original.statut} />,
      },
      {
        accessorKey: 'date_soumission',
        header: 'Attente',
        cell: ({ row }) => (
          // L'anciennete prime sur la date exacte : un dossier qui traine
          // bloque un client qui ne peut pas transacter.
          <span
            className="whitespace-nowrap text-slate-600"
            title={formatDateTime(row.original.date_soumission)}
          >
            {formatRelative(row.original.date_soumission)}
          </span>
        ),
      },
      {
        accessorKey: 'decide_par_username',
        header: 'Decide par',
        cell: ({ row }) => (
          <span className="text-xxs text-slate-500">
            {row.original.decide_par_username || '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Verification KYC"
        description="File d’examen, du dossier le plus ancien au plus recent."
      />

      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <div className="w-72">
            <Input
              placeholder="Nom, identifiant, numero de piece…"
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
              options={STATUT_OPTIONS}
              value={statut}
              onChange={(event) => {
                setStatut(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-44">
            <Select
              options={NIVEAU_OPTIONS}
              value={niveau}
              onChange={(event) => {
                setNiveau(event.target.value);
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
          emptyTitle="Aucun dossier"
          emptyDescription="Aucun dossier ne correspond a ces criteres."
          // Le tri est impose par le serveur (anciennete) : le desactiver
          // evite qu'un tri local ne donne l'illusion d'une autre priorite.
          enableSorting={false}
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

      <KycReviewModal submission={inspected} onClose={() => setInspected(null)} />
    </div>
  );
}
