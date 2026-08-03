/**
 * MIROIR des codes de permission definis cote backend.
 *
 * ATTENTION : ce fichier ne sert QU'A masquer / desactiver des elements
 * d'interface. Il n'a AUCUNE valeur de securite. La verification qui fait foi
 * est effectuee cote serveur, sur chaque endpoint. Un utilisateur qui
 * modifierait ces valeurs dans son navigateur ne gagnerait aucun droit : les
 * appels API correspondants seraient rejetes en 403.
 *
 * Toute modification ici doit refleter une modification cote backend.
 */

export const PERMISSIONS = {
  USER_READ: 'user.read',
  USER_SUSPEND: 'user.suspend',
  USER_PII_REVEAL: 'user.pii_reveal',
  KYC_REVIEW: 'kyc.review',
  KYC_APPROVE: 'kyc.approve',
  WALLET_READ: 'wallet.read',
  WALLET_ADJUST: 'wallet.adjust',
  TX_READ: 'tx.read',
  TX_FORCE_STATUS: 'tx.force_status',
  TONTINE_READ: 'tontine.read',
  TONTINE_MODERATE: 'tontine.moderate',
  CAGNOTTE_READ: 'cagnotte.read',
  CAGNOTTE_MODERATE: 'cagnotte.moderate',
  DISPUTE_READ: 'dispute.read',
  DISPUTE_RESOLVE: 'dispute.resolve',
  AUDIT_READ: 'audit.read',
  STAFF_MANAGE: 'staff.manage',
  SETTINGS_WRITE: 'settings.write',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Libelles francais des permissions, pour l'ecran de gestion du staff. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.USER_READ]: 'Consulter les utilisateurs',
  [PERMISSIONS.USER_SUSPEND]: 'Suspendre un utilisateur',
  [PERMISSIONS.USER_PII_REVEAL]: 'Reveler les donnees personnelles',
  [PERMISSIONS.KYC_REVIEW]: 'Examiner les dossiers KYC',
  [PERMISSIONS.KYC_APPROVE]: 'Approuver un dossier KYC',
  [PERMISSIONS.WALLET_READ]: 'Consulter les portefeuilles',
  [PERMISSIONS.WALLET_ADJUST]: 'Ajuster un solde',
  [PERMISSIONS.TX_READ]: 'Consulter les transactions',
  [PERMISSIONS.TX_FORCE_STATUS]: 'Forcer le statut d’une transaction',
  [PERMISSIONS.TONTINE_READ]: 'Consulter les tontines',
  [PERMISSIONS.TONTINE_MODERATE]: 'Moderer une tontine',
  [PERMISSIONS.CAGNOTTE_READ]: 'Consulter les cagnottes',
  [PERMISSIONS.CAGNOTTE_MODERATE]: 'Moderer une cagnotte',
  [PERMISSIONS.DISPUTE_READ]: 'Consulter les litiges',
  [PERMISSIONS.DISPUTE_RESOLVE]: 'Resoudre un litige',
  [PERMISSIONS.AUDIT_READ]: 'Consulter le journal d’audit',
  [PERMISSIONS.STAFF_MANAGE]: 'Gerer les comptes staff',
  [PERMISSIONS.SETTINGS_WRITE]: 'Modifier les parametres',
};

/** Regroupement par domaine, utilise pour l'affichage. */
export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: 'Utilisateurs',
    permissions: [PERMISSIONS.USER_READ, PERMISSIONS.USER_SUSPEND, PERMISSIONS.USER_PII_REVEAL],
  },
  { label: 'KYC', permissions: [PERMISSIONS.KYC_REVIEW, PERMISSIONS.KYC_APPROVE] },
  { label: 'Portefeuilles', permissions: [PERMISSIONS.WALLET_READ, PERMISSIONS.WALLET_ADJUST] },
  { label: 'Transactions', permissions: [PERMISSIONS.TX_READ, PERMISSIONS.TX_FORCE_STATUS] },
  { label: 'Tontines', permissions: [PERMISSIONS.TONTINE_READ, PERMISSIONS.TONTINE_MODERATE] },
  { label: 'Cagnottes', permissions: [PERMISSIONS.CAGNOTTE_READ, PERMISSIONS.CAGNOTTE_MODERATE] },
  { label: 'Litiges', permissions: [PERMISSIONS.DISPUTE_READ, PERMISSIONS.DISPUTE_RESOLVE] },
  {
    label: 'Administration',
    permissions: [PERMISSIONS.AUDIT_READ, PERMISSIONS.STAFF_MANAGE, PERMISSIONS.SETTINGS_WRITE],
  },
];

/** Vrai si la liste contient la permission demandee (affichage uniquement). */
export function hasPermission(granted: string[], required: Permission): boolean {
  return granted.includes(required);
}

/** Vrai si au moins une des permissions demandees est presente. */
export function hasAnyPermission(granted: string[], required: Permission[]): boolean {
  if (required.length === 0) return true;
  return required.some((permission) => granted.includes(permission));
}

/** Vrai si toutes les permissions demandees sont presentes. */
export function hasAllPermissions(granted: string[], required: Permission[]): boolean {
  return required.every((permission) => granted.includes(permission));
}
