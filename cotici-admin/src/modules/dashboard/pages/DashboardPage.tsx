import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowLeftRight,
  BadgeCheck,
  HandCoins,
  RefreshCw,
  Users,
  Users2,
  Wallet,
} from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/lib/api/client';
import { formatAmount, formatNumber } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
import { Button, Card, CardStat, EmptyState, Skeleton } from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useDashboardSeries, useDashboardStats } from '../api/dashboard';
import { Sparkline } from '../components/Sparkline';

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardStats();
  const series = useDashboardSeries('transactions_volume', 30);

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description="Vue operationnelle consolidee de la plateforme."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching}
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          >
            Actualiser
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            title="Indicateurs indisponibles"
            description={errorMessage(error)}
            action={
              <Button variant="outline" onClick={() => void refetch()}>
                Reessayer
              </Button>
            }
          />
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CardStat
              label="Utilisateurs"
              value={formatNumber(data.users_total)}
              hint={`+${formatNumber(data.users_new_today)} aujourd'hui`}
              icon={<Users className="h-4 w-4" aria-hidden />}
            />
            <CardStat
              label="KYC en attente"
              value={formatNumber(data.kyc_pending)}
              hint="Dossiers a examiner"
              tone={data.kyc_pending > 0 ? 'warning' : 'neutral'}
              icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
            />
            <CardStat
              label="Encours des portefeuilles"
              value={formatAmount(data.wallets_balance_total)}
              hint="Somme des soldes clients"
              icon={<Wallet className="h-4 w-4" aria-hidden />}
            />
            <CardStat
              label="Volume du jour"
              value={formatAmount(data.transactions_volume_today)}
              hint={`${formatNumber(data.transactions_today)} transaction(s)`}
              icon={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
            />
            <CardStat
              label="Transactions echouees"
              value={formatNumber(data.transactions_failed_today)}
              hint="Sur les dernieres 24 h"
              tone={data.transactions_failed_today > 0 ? 'danger' : 'positive'}
              icon={<ArrowLeftRight className="h-4 w-4" aria-hidden />}
            />
            <CardStat
              label="Tontines actives"
              value={formatNumber(data.tontines_active)}
              icon={<Users2 className="h-4 w-4" aria-hidden />}
            />
            <CardStat
              label="Cagnottes actives"
              value={formatNumber(data.cagnottes_active)}
              icon={<HandCoins className="h-4 w-4" aria-hidden />}
            />
            <CardStat
              label="Litiges ouverts"
              value={formatNumber(data.disputes_open)}
              tone={data.disputes_open > 0 ? 'warning' : 'neutral'}
              icon={<AlertOctagon className="h-4 w-4" aria-hidden />}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title="Volume transactionnel"
              description="30 derniers jours"
            >
              {series.isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : series.isError ? (
                <p className="text-xxs text-slate-500">{errorMessage(series.error)}</p>
              ) : (
                <Sparkline points={series.data ?? []} />
              )}
            </Card>

            <Card title="Acces rapides">
              <div className="flex flex-col gap-1.5">
                <IfPermission permissions={[PERMISSIONS.AUDIT_READ]}>
                  <Link to={ROUTES.audit}>
                    <Button variant="outline" size="sm" fullWidth>
                      Journal d’audit
                    </Button>
                  </Link>
                </IfPermission>
                <IfPermission permissions={[PERMISSIONS.STAFF_MANAGE]}>
                  <Link to={ROUTES.staff}>
                    <Button variant="outline" size="sm" fullWidth>
                      Comptes staff
                    </Button>
                  </Link>
                </IfPermission>
                <IfPermission permissions={[PERMISSIONS.KYC_REVIEW]}>
                  <Link to={ROUTES.kyc}>
                    <Button variant="outline" size="sm" fullWidth>
                      Dossiers KYC
                    </Button>
                  </Link>
                </IfPermission>
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
