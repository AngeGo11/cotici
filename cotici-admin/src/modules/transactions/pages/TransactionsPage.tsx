import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { AdminTransaction, TransactionStatus } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useDebounce, usePagination } from '@/hooks';
import {
  Badge,
  Card,
  DataTable,
  DateRangePicker,
  EMPTY_RANGE,
  Input,
  Money,
  Pagination,
  ReasonDialog,
  Select,
  StatusPill,
  type DateRange,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useForceTransactionStatus, useTransactionsList } from '../api/transactions';
import { TransactionDetailModal } from '../components/TransactionDetailModal';

/** Statuts possibles, dans l'ordre du cycle de vie d'une transaction. */
const STATUT_OPTIONS = [
  { value: 'EN ATTENTE', label: 'En attente' },
  { value: 'RÉUSSIE', label: 'Réussie' },
  { value: 'ÉCHOUÉE', label: 'Échouée' },
  { value: 'ANNULÉE', label: 'Annulée' },
];

const TYPE_OPTIONS = [
  { value: 'RETRAIT', label: 'Retrait' },
  { value: 'DÉPÔT', label: 'Dépôt' },
  { value: 'VERSEMENT_EPARGNE_PERSONNELLE', label: 'Versement épargne personnelle' },
  { value: 'RETRAIT_EPARGNE_PERSONNELLE', label: 'Retrait épargne personnelle' },
  { value: 'DÉBIT', label: 'Débit' },
  { value: 'CONTRIBUTION_SOLIDAIRE', label: 'Contribution solidaire' },
  { value: 'VERSEMENT_SOLIDAIRE', label: 'Versement solidaire' },
  { value: 'VALIDATION_VERSEMENT_SOLIDAIRE', label: 'Validation versement solidaire' },
  { value: 'CONTRIBUTION_CAGNOTTE', label: 'Contribution cagnotte' },
  { value: 'VERSEMENT_CAGNOTTE', label: 'Versement cagnotte' },
  { value: 'PENALITE', label: 'Pénalité de retard' },
  { value: 'VERSEMENT_PENALITE', label: 'Versement pénalité' },
];

const MODE_OPTIONS = [
  { value: 'ORANGE', label: 'Orange' },
  { value: 'MTN', label: 'Mtn' },
  { value: 'WAVE', label: 'Wave' },
  { value: 'MOOV', label: 'Moov' },
  { value: 'SOLDE_COTICI', label: 'Solde Cotici' },
];

interface PendingForceStatus {
  transaction: AdminTransaction;
  targetStatus: TransactionStatus;
}

const TARGET_STATUS_LABELS: Record<TransactionStatus, string> = {
  'EN ATTENTE': 'En attente',
  'RÉUSSIE': 'Réussie',
  'ÉCHOUÉE': 'Échouée',
  'ANNULÉE': 'Annulée',
};

export default function TransactionsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [statut, setStatut] = useState('');
  const [type, setType] = useState('');
  const [mode, setMode] = useState('');
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [selected, setSelected] = useState<AdminTransaction | null>(null);
  const [toForce, setToForce] = useState<PendingForceStatus | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      statut: statut || undefined,
      type: type || undefined,
      mode: mode || undefined,
      date_from: range.from || undefined,
      date_to: range.to || undefined,
    }),
    [page, pageSize, debouncedSearch, statut, type, mode, range],
  );

  const { data, isLoading, isError, error, isFetching } = useTransactionsList(params);
  const forceStatus = useForceTransactionStatus();

  const resetPage = () => setPage(1);

  const handleForceStatus = async (reason: string) => {
    if (!toForce) return;
    try {
      await forceStatus.mutateAsync({
        id: toForce.transaction.id,
        new_status: toForce.targetStatus,
        reason,
      });
      toast.success(
        'Statut force',
        `Transaction ${toForce.transaction.ref_transaction} marquee ${TARGET_STATUS_LABELS[toForce.targetStatus].toLowerCase()}.`,
      );
      setToForce(null);
      setSelected(null);
    } catch (caught) {
      toast.error('Action refusee', errorMessage(caught));
    }
  };

  const columns = useMemo<ColumnDef<AdminTransaction, unknown>[]>(
    () => [
      {
        accessorKey: 'date_transaction',
        header: 'Horodatage',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDateTime(row.original.date_transaction)}
          </span>
        ),
      },
      {
        accessorKey: 'ref_transaction',
        header: 'Reference',
        cell: ({ row }) => (
          <span className="font-mono text-xxs text-slate-700">{row.original.ref_transaction}</span>
        ),
      },
      {
        id: 'titulaire',
        header: 'Titulaire',
        cell: ({ row }) => {
          const titulaire = row.original.titulaire;
          const fullName = [titulaire.first_name, titulaire.last_name].filter(Boolean).join(' ');
          return (
            <div className="leading-tight">
              <p className="font-medium text-slate-900">{fullName || titulaire.username}</p>
              <p className="font-mono text-xxs text-slate-500">{titulaire.numero_telephone_masque}</p>
            </div>
          );
        },
      },
      {
        accessorKey: 'type_transaction_display',
        header: 'Type',
        cell: ({ row }) => <Badge tone="brand">{row.original.type_transaction_display}</Badge>,
      },
      {
        accessorKey: 'mode_de_paiement_display',
        header: 'Mode',
        cell: ({ row }) => <Badge tone="neutral">{row.original.mode_de_paiement_display}</Badge>,
      },
      {
        accessorKey: 'montant_transaction',
        header: 'Montant',
        cell: ({ row }) => <Money value={row.original.montant_transaction} />,
      },
      {
        accessorKey: 'statut_transaction',
        header: 'Statut',
        cell: ({ row }) => (
          <StatusPill
            status={row.original.statut_transaction}
            label={row.original.statut_transaction_display}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Depots, retraits et transferts du portefeuille. Le forcage de statut ne modifie jamais un solde."
      />

      <Card flush>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <Input
                placeholder="Reference, titulaire, telephone…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPage();
                }}
                icon={<Search className="h-3.5 w-3.5" aria-hidden />}
              />
            </div>
            <div className="w-40">
              <Select
                placeholder="Tous les statuts"
                options={STATUT_OPTIONS}
                value={statut}
                onChange={(event) => {
                  setStatut(event.target.value);
                  resetPage();
                }}
              />
            </div>
            <div className="w-56">
              <Select
                placeholder="Tous les types"
                options={TYPE_OPTIONS}
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  resetPage();
                }}
              />
            </div>
            <div className="w-40">
              <Select
                placeholder="Tous les modes"
                options={MODE_OPTIONS}
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value);
                  resetPage();
                }}
              />
            </div>
          </div>
          <DateRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              resetPage();
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
          emptyTitle="Aucune transaction"
          emptyDescription="Aucune transaction ne correspond aux filtres selectionnes."
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

      <TransactionDetailModal
        transaction={selected}
        onClose={() => setSelected(null)}
        onForceStatus={(transaction, targetStatus) => setToForce({ transaction, targetStatus })}
      />

      <ReasonDialog
        open={toForce !== null}
        title="Forcer le statut de la transaction"
        message={
          toForce && (
            <p>
              Transaction <strong>{toForce.transaction.ref_transaction}</strong> : passage force de{' '}
              <em>{toForce.transaction.statut_transaction_display}</em> vers{' '}
              <strong>{TARGET_STATUS_LABELS[toForce.targetStatus]}</strong>. Cette action ne modifie
              ni ne recalcule le solde du portefeuille : seul le statut de la transaction est force.
            </p>
          )
        }
        confirmLabel="Confirmer le forcage"
        destructive
        loading={forceStatus.isPending}
        onConfirm={(reason) => void handleForceStatus(reason)}
        onClose={() => setToForce(null)}
      />
    </div>
  );
}
