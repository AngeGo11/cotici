/** Libelles et ordre d'affichage des groupes de reglages (`PlatformSetting.group`). */
export const GROUP_LABELS: Record<string, string> = {
  wallet: 'Portefeuille',
  tontine: 'Tontines',
  kyc: 'Verification KYC',
  platform: 'Plateforme',
};

/** Ordre d'affichage souhaite ; tout groupe inconnu du catalogue frontal est ajoute a la suite. */
export const GROUP_ORDER: string[] = ['wallet', 'tontine', 'kyc', 'platform'];
