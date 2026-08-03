import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, Sliders } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/lib/api/client';
import type { WalletSummary } from '@/lib/api/types';
import { formatDateTime, formatFullName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { useAuth } from '@/auth/useAuth';
import { IfPermission } from '@/auth/RequirePermission';
import { useDebounce, usePagination } from '@/hooks';
import { Card, DataTable, Input, Money, Pagination, Select, useToast } from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useAdjustWallet, useWalletList } from '../api/wallets';
import { WalletAdjustDialog } from '../components/WalletAdjustDialog';
import { WalletDetailModal } from '../components/WalletDetailModal';

const ORDERING_OPTIONS = [
  { value: '-solde_courant', label: 'Solde decroissant' },
  { value: 'solde_courant', label: 'Solde croissant' },
  { value: '-transactions_count', label: 'Plus de transactions' },
  { value: '-user__date_joined', label: 'Compte le plus recent' },
];

export default function WalletsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState('-solde_courant');
  const [adjustTarget, setAdjustTarget] = useState<WalletSummary | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const canAdjust = can(PERMISSIONS.WALLET_ADJUST);
  const inspectedId = id ? Number(id) : null;

  const params = useMemo(
    () => ({ page, page_size: pageSize, search: debouncedSearch || undefined, ordering }),
    [page, pageSize, debouncedSearch, ordering],
  );

  const { data, isLoading, isError, error, isFetching } = useWalletList(params);
  const adjustWallet = useAdjustWallet();

  const handleAdjustConfirm = async (amount: number, reason: string) => {
    if (!adjustTarget) return;
    try {
      await adjustWallet.mutateAsync({ id: adjustTarget.id, amount, reason });
      toast.success('Solde ajuste', `${formatFullName(adjustTarget)} — nouveau solde applique.`);
      setAdjustTarget(null);
    } catch (caught) {
      toast.error('Ajustement refuse', errorMessage(caught));
    }
  };

  const columns = useMemo<ColumnDef<WalletSummary, unknown>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Titulaire',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{formatFullName(row.original)}</p>
            <p className="text-xxs text-slate-500">{row.original.numero_telephone_masque}</p>
          </div>
        ),
      },
      {
        accessorKey: 'solde_courant',
        header: 'Solde',
        cell: ({ row }) => <Money value={row.original.solde_courant} />,
      },
      {
        accessorKey: 'transactions_count',
        header: 'Transactions',
        cell: ({ row }) => (
          <span className="tabular text-slate-600">{row.original.transactions_count}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Compte cree le',
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular text-slate-600">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <IfPermission permissions={[PERMISSIONS.WALLET_ADJUST]}>
            <button
              type="button"
              className="text-xxs text-brand-dark underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                setAdjustTarget(row.original);
              }}
            >
              Ajuster le solde
            </button>
          </IfPermission>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Portefeuilles"
        description="Soldes clients et ajustements manuels tracés dans le journal d’audit."
      />

      <Card flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
          <div className="w-64">
            <Input
              placeholder="Nom, identifiant, telephone…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              icon={<Search className="h-3.5 w-3.5" aria-hidden />}
            />
          </div>
          <div className="flex items-center gap-2">
            <Sliders className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <Select
              className="w-56"
              value={ordering}
              onChange={(event) => {
                setOrdering(event.target.value);
                setPage(1);
              }}
              options={ORDERING_OPTIONS}
            />
          </div>
        </div>

        {!canAdjust && (
          <p className="border-b border-slate-100 px-3 py-2 text-xxs text-slate-500">
            Consultation seule : la permission wallet.adjust est requise pour ajuster un solde.
          </p>
        )}

        <DataTable
          data={data?.results ?? []}
          columns={columns}
          loading={isLoading}
          error={isError ? errorMessage(error) : null}
          enableSorting={false}
          emptyTitle="Aucun portefeuille"
          onRowClick={(wallet) => navigate(ROUTES.walletDetail(wallet.id))}
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

      <WalletDetailModal
        walletId={inspectedId}
        onClose={() => navigate(ROUTES.wallets)}
        onAdjust={() => {
          const current = data?.results.find((wallet) => wallet.id === inspectedId);
          if (current) setAdjustTarget(current);
        }}
      />

      <WalletAdjustDialog
        open={adjustTarget !== null}
        wallet={adjustTarget}
        loading={adjustWallet.isPending}
        onConfirm={(amount, reason) => void handleAdjustConfirm(amount, reason)}
        onClose={() => setAdjustTarget(null)}
      />
    </div>
  );
}
