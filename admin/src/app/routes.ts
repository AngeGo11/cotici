/** Constantes de chemins. Unique source de verite pour la navigation. */

export const ROUTES = {
  root: '/',
  login: '/login',
  totp: '/login/2fa',
  totpSetup: '/login/2fa/configuration',
  forbidden: '/acces-refuse',

  dashboard: '/tableau-de-bord',

  users: '/utilisateurs',
  userDetail: (id: string | number = ':id') => `/utilisateurs/${id}`,

  kyc: '/kyc',
  kycDetail: (id: string | number = ':id') => `/kyc/${id}`,

  wallets: '/portefeuilles',
  walletDetail: (id: string | number = ':id') => `/portefeuilles/${id}`,

  transactions: '/transactions',
  transactionDetail: (id: string | number = ':id') => `/transactions/${id}`,

  tontines: '/tontines',
  tontineDetail: (id: string | number = ':id') => `/tontines/${id}`,

  cagnottes: '/cagnottes',
  cagnotteDetail: (id: string | number = ':id') => `/cagnottes/${id}`,

  savings: '/epargnes',
  solidarity: '/solidarite',

  disputes: '/litiges',
  disputeDetail: (id: string | number = ':id') => `/litiges/${id}`,

  audit: '/audit',
  staff: '/staff',
  settings: '/parametres',
} as const;

/** Route affichee juste apres connexion. */
export const DEFAULT_ROUTE = ROUTES.dashboard;

/** Parametre de requete conservant la destination avant redirection. */
export const REDIRECT_PARAM = 'suivant';
