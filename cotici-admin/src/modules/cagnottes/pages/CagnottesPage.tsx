import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, RotateCcw, Search, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api/client';
import type { CagnotteEtat, CagnotteListItem, CagnotteModerationAction } from '@/lib/api/types';
import { formatFullName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
import { useDebounce, usePagination } from '@/hooks';
import {
  Button,
  Card,
  DataTable,
  Input,
  Money,
  Pagination,
  Select,
  StatusPill,
  useToast,
} from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useCagnottesList, useModerateCagnotte } from '../api/cagnottes';
import { CagnotteDetailModal } from '../components/CagnotteDetailModal';
import { CagnotteModerateDialog, type PendingModeration } from '../components/CagnotteModerateDialog';
import { CagnotteProgress } from '../components/CagnotteProgress';

/** Libelle + tone d'affichage pour `etat` (valeurs francaises en base). */
const ETAT_DISPLAY: Record<CagnotteEtat, { label: string; tone: 'success' | 'neutral' | 'danger' }> = {
  ACTIF: { label: 'Active', tone: 'success' },
  ARCHIVÉ: { label: 'Archivee', tone: 'neutral' },
  SUPPRIMÉ: { label: 'Supprimee', tone: 'danger' },
};

const ETAT_OPTIONS = [
  { value: 'ACTIF', label: 'Active' },
  { value: 'ARCHIVÉ', label: 'Archivee' },
  { value: 'SUPPRIMÉ', label: 'Supprimee' },
];

const OBJECTIF_OPTIONS = [
  { value: 'true', label: 'Objectif atteint' },
  { value: 'false', label: 'Objectif non atteint' },
];

export default function CagnottesPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [etat, setEtat] = useState('');
  const [objectifAtteint, setObjectifAtteint] = useState('');
  const [inspectedId, setInspectedId] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingModeration | null>(null);
  const debouncedSearch = useDebounce(search);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const params = useMemo(
    () => ({
      page,
      page_size: pageSize,
      search: debouncedSearch || undefined,
      etat: etat || undefined,
      objectif_atteint: objectifAtteint || undefined,
    }),
    [page, pageSize, debouncedSearch, etat, objectifAtteint],
  );

  const { data, isLoading, isError, error, isFetching } = useCagnottesList(params);
  const moderate = useModerateCagnotte();

  const handleConfirm = async (reason: string) => {
    if (!pending) return;
    try {
      await moderate.mutateAsync({ id: pending.cagnotte.id, action: pending.action, reason });
      toast.success('Cagnotte mise a jour', pending.cagnotte.nom_cagnotte);
      setPending(null);
    } catch (caught) {
      toast.error('Action refusee', errorMessage(caught));
    }
  };

  const requestModeration = (cagnotte: CagnotteListItem, action: CagnotteModerationAction) => {
    setPending({ cagnotte, action });
  };

  const columns = useMemo<ColumnDef<CagnotteListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'nom_cagnotte',
        header: 'Nom',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="font-medium text-slate-900">{row.original.nom_cagnotte}</p>
            <p className="text-xxs text-slate-500">
              {row.original.membres_count} membre(s)
            </p>
          </div>
        ),
      },
      {
        id: 'organisateur',
        header: 'Organisateur',
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="text-slate-900">{formatFullName(row.original.organisateur)}</p>
            <p className="font-mono text-xxs text-slate-500">
              {row.original.organisateur.numero_telephone_masque}
            </p>
          </div>
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
        cell: ({ row }) => (
          <CagnotteProgress
            progression={row.original.progression}
            objectifAtteint={row.original.objectif_atteint}
          />
        ),
      },
      {
        accessorKey: 'etat',
        header: 'Etat',
        cell: ({ row }) => {
          const display = ETAT_DISPLAY[row.original.etat];
          return <StatusPill status={row.original.etat} label={display?.label} tone={display?.tone} />;
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const cagnotte = row.original;
          return (
            <IfPermission permissions={[PERMISSIONS.CAGNOTTE_MODERATE]}>
              <div className="flex items-center justify-end gap-1">
                {cagnotte.etat === 'ACTIF' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      requestModeration(cagnotte, 'archive');
                    }}
                    icon={<Archive className="h-3.5 w-3.5" aria-hidden />}
                  >
                    Archiver
                  </Button>
                )}
                {cagnotte.etat !== 'ACTIF' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      requestModeration(cagnotte, 'restore');
                    }}
                    icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                  >
                    Restaurer
                  </Button>
                )}
                {cagnotte.etat !== 'SUPPRIMÉ' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      requestModeration(cagnotte, 'delete');
                    }}
                    icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  >
                    Supprimer
                  </Button>
                )}
              </div>
            </IfPermission>
          );
        },
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Cagnottes"
        description="Consultation et moderation des collectes ciblees (cagnottes)."
      />

      <Card flush>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
          <div className="w-64">
            <Input
              placeholder="Nom, organisateur…"
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
              placeholder="Tous les etats"
              options={ETAT_OPTIONS}
              value={etat}
              onChange={(event) => {
                setEtat(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-56">
            <Select
              placeholder="Tous les objectifs"
              options={OBJECTIF_OPTIONS}
              value={objectifAtteint}
              onChange={(event) => {
                setObjectifAtteint(event.target.value);
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
          onRowClick={(row) => setInspectedId(row.id)}
          emptyTitle="Aucune cagnotte"
          emptyDescription="Aucune cagnotte ne correspond aux filtres selectionnes."
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

      <CagnotteDetailModal cagnotteId={inspectedId} onClose={() => setInspectedId(null)} />

      <CagnotteModerateDialog
        pending={pending}
        loading={moderate.isPending}
        onConfirm={(reason) => void handleConfirm(reason)}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
