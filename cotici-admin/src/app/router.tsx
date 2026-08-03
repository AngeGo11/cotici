import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { RequireAnonymous, RequireAuth } from '@/auth/RequireAuth';
import { RequirePermission } from '@/auth/RequirePermission';
import { AdminShell } from '@/layout/AdminShell';
import { PERMISSIONS } from '@/lib/permissions';
import { DEFAULT_ROUTE, ROUTES } from './routes';

/* Chargement paresseux par module : le bundle initial reste reduit et chaque
 * section n'est telechargee que si l'operateur y a acces. */

const LoginPage = lazy(() => import('@/auth/LoginPage'));
const TotpPage = lazy(() => import('@/auth/TotpPage'));
const TotpSetupPage = lazy(() => import('@/auth/TotpSetupPage'));
const NotFound = lazy(() => import('@/layout/NotFound'));
const Forbidden = lazy(() => import('@/layout/Forbidden'));

const DashboardPage = lazy(() => import('@/modules/dashboard/pages/DashboardPage'));
const AuditPage = lazy(() => import('@/modules/audit/pages/AuditPage'));
const StaffPage = lazy(() => import('@/modules/staff/pages/StaffPage'));

const UsersPage = lazy(() => import('@/modules/users/pages/UsersPage'));
const KycPage = lazy(() => import('@/modules/kyc/pages/KycPage'));
const WalletsPage = lazy(() => import('@/modules/wallets/pages/WalletsPage'));
const TransactionsPage = lazy(() => import('@/modules/transactions/pages/TransactionsPage'));
const TontinesPage = lazy(() => import('@/modules/tontines/pages/TontinesPage'));
const CagnottesPage = lazy(() => import('@/modules/cagnottes/pages/CagnottesPage'));
const SavingsPage = lazy(() => import('@/modules/savings/pages/SavingsPage'));
const SolidarityPage = lazy(() => import('@/modules/solidarity/pages/SolidarityPage'));
const DisputesPage = lazy(() => import('@/modules/disputes/pages/DisputesPage'));
const SettingsPage = lazy(() => import('@/modules/settings/pages/SettingsPage'));

export const router = createBrowserRouter([
  {
    // Parcours de connexion, inaccessible une fois la session ouverte.
    element: <RequireAnonymous />,
    children: [
      { path: ROUTES.login, element: <LoginPage /> },
      { path: ROUTES.totp, element: <TotpPage /> },
      { path: ROUTES.totpSetup, element: <TotpSetupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { index: true, element: <Navigate to={DEFAULT_ROUTE} replace /> },
          { path: ROUTES.dashboard, element: <DashboardPage /> },
          { path: ROUTES.forbidden, element: <Forbidden /> },

          {
            element: <RequirePermission permissions={[PERMISSIONS.USER_READ]} />,
            children: [
              { path: ROUTES.users, element: <UsersPage /> },
              { path: ROUTES.userDetail(), element: <UsersPage /> },
            ],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.KYC_REVIEW]} />,
            children: [
              { path: ROUTES.kyc, element: <KycPage /> },
              { path: ROUTES.kycDetail(), element: <KycPage /> },
            ],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.WALLET_READ]} />,
            children: [
              { path: ROUTES.wallets, element: <WalletsPage /> },
              { path: ROUTES.walletDetail(), element: <WalletsPage /> },
              { path: ROUTES.savings, element: <SavingsPage /> },
            ],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.TX_READ]} />,
            children: [
              { path: ROUTES.transactions, element: <TransactionsPage /> },
              { path: ROUTES.transactionDetail(), element: <TransactionsPage /> },
            ],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.TONTINE_READ]} />,
            children: [
              { path: ROUTES.tontines, element: <TontinesPage /> },
              { path: ROUTES.tontineDetail(), element: <TontinesPage /> },
            ],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.CAGNOTTE_READ]} />,
            children: [
              { path: ROUTES.cagnottes, element: <CagnottesPage /> },
              { path: ROUTES.cagnotteDetail(), element: <CagnottesPage /> },
              { path: ROUTES.solidarity, element: <SolidarityPage /> },
            ],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.DISPUTE_READ]} />,
            children: [
              { path: ROUTES.disputes, element: <DisputesPage /> },
              { path: ROUTES.disputeDetail(), element: <DisputesPage /> },
            ],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.AUDIT_READ]} />,
            children: [{ path: ROUTES.audit, element: <AuditPage /> }],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.STAFF_MANAGE]} />,
            children: [{ path: ROUTES.staff, element: <StaffPage /> }],
          },
          {
            element: <RequirePermission permissions={[PERMISSIONS.SETTINGS_WRITE]} />,
            children: [{ path: ROUTES.settings, element: <SettingsPage /> }],
          },

          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
