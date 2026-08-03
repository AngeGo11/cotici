/**
 * Catalogue centralise des routes de l'API d'administration.
 * Les modules en phase 1/2 sont declares ici pour figer le contrat attendu.
 */

export const endpoints = {
  auth: {
    csrf: '/api/admin/auth/csrf/',
    login: '/api/admin/auth/login/',
    totpVerify: '/api/admin/auth/totp/verify/',
    totpSetup: '/api/admin/auth/totp/setup/',
    logout: '/api/admin/auth/logout/',
  },
  me: '/api/admin/me/',
  dashboard: {
    stats: '/api/admin/dashboard/stats/',
    series: '/api/admin/dashboard/series/',
  },
  audit: {
    list: '/api/admin/audit/',
    detail: (id: number | string) => `/api/admin/audit/${id}/`,
  },
  staff: {
    list: '/api/admin/staff/',
    detail: (id: number | string) => `/api/admin/staff/${id}/`,
    resetTotp: (id: number | string) => `/api/admin/staff/${id}/reset-totp/`,
    deactivate: (id: number | string) => `/api/admin/staff/${id}/deactivate/`,
    reactivate: (id: number | string) => `/api/admin/staff/${id}/reactivate/`,
    changeRole: (id: number | string) => `/api/admin/staff/${id}/role/`,
  },

  // --- Phase 1 / 2 : contrats prevus, non encore implementes ---
  users: {
    list: '/api/admin/users/',
    detail: (id: number | string) => `/api/admin/users/${id}/`,
    suspend: (id: number | string) => `/api/admin/users/${id}/suspend/`,
    reactivate: (id: number | string) => `/api/admin/users/${id}/reactivate/`,
    revealPii: (id: number | string) => `/api/admin/users/${id}/reveal-pii/`,
  },
  wallets: {
    list: '/api/admin/wallets/',
    detail: (id: number | string) => `/api/admin/wallets/${id}/`,
    adjust: (id: number | string) => `/api/admin/wallets/${id}/adjust/`,
  },
  transactions: {
    list: '/api/admin/transactions/',
    detail: (id: number | string) => `/api/admin/transactions/${id}/`,
    forceStatus: (id: number | string) => `/api/admin/transactions/${id}/force-status/`,
  },
  tontines: {
    list: '/api/admin/tontines/',
    detail: (id: number | string) => `/api/admin/tontines/${id}/`,
    moderate: (id: number | string) => `/api/admin/tontines/${id}/moderate/`,
  },
  cagnottes: {
    list: '/api/admin/cagnottes/',
    detail: (id: number | string) => `/api/admin/cagnottes/${id}/`,
    moderate: (id: number | string) => `/api/admin/cagnottes/${id}/moderate/`,
  },
  savings: {
    list: '/api/admin/savings/',
    detail: (id: number | string) => `/api/admin/savings/${id}/`,
  },
  solidarity: {
    list: '/api/admin/solidarity/',
    detail: (id: number | string) => `/api/admin/solidarity/${id}/`,
  },
  kyc: {
    list: '/api/admin/kyc/',
    detail: (id: number | string) => `/api/admin/kyc/${id}/`,
    approve: (id: number | string) => `/api/admin/kyc/${id}/approve/`,
    reject: (id: number | string) => `/api/admin/kyc/${id}/reject/`,
    takeInReview: (id: number | string) => `/api/admin/kyc/${id}/take-in-review/`,
    /**
     * Flux authentifie d'une piece justificative. Utilisable directement
     * comme `src` d'une balise <img> : le cookie de session part avec la
     * requete, et le serveur journalise chaque consultation.
     */
    document: (id: number | string, piece: string) =>
      `/api/admin/kyc/${id}/document/${piece}/`,
  },
  disputes: {
    list: '/api/admin/disputes/',
    detail: (id: number | string) => `/api/admin/disputes/${id}/`,
    resolve: (id: number | string) => `/api/admin/disputes/${id}/resolve/`,
  },
  settings: {
    read: '/api/admin/settings/',
    write: '/api/admin/settings/',
  },
} as const;
