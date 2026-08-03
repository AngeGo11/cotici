import type { LucideIcon } from 'lucide-react';
import {
  AlertOctagon,
  BadgeCheck,
  Banknote,
  ArrowLeftRight,
  ClipboardList,
  Gauge,
  HandCoins,
  HeartHandshake,
  PiggyBank,
  Settings,
  ShieldCheck,
  Users,
  Users2,
} from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { PERMISSIONS, type Permission } from '@/lib/permissions';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Permissions requises pour afficher l'entree (masquage UI uniquement). */
  permissions: Permission[];
  /** Marque les modules non encore implementes. */
  upcoming?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    label: 'Pilotage',
    items: [
      {
        label: 'Tableau de bord',
        to: ROUTES.dashboard,
        icon: Gauge,
        permissions: [],
      },
    ],
  },
  {
    label: 'Clients',
    items: [
      {
        label: 'Utilisateurs',
        to: ROUTES.users,
        icon: Users,
        permissions: [PERMISSIONS.USER_READ],
        upcoming: true,
      },
      {
        label: 'Verification KYC',
        to: ROUTES.kyc,
        icon: BadgeCheck,
        permissions: [PERMISSIONS.KYC_REVIEW],
        upcoming: true,
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        label: 'Portefeuilles',
        to: ROUTES.wallets,
        icon: Banknote,
        permissions: [PERMISSIONS.WALLET_READ],
        upcoming: true,
      },
      {
        label: 'Transactions',
        to: ROUTES.transactions,
        icon: ArrowLeftRight,
        permissions: [PERMISSIONS.TX_READ],
        upcoming: true,
      },
    ],
  },
  {
    label: 'Produits',
    items: [
      {
        label: 'Tontines',
        to: ROUTES.tontines,
        icon: Users2,
        permissions: [PERMISSIONS.TONTINE_READ],
        upcoming: true,
      },
      {
        label: 'Cagnottes',
        to: ROUTES.cagnottes,
        icon: HandCoins,
        permissions: [PERMISSIONS.CAGNOTTE_READ],
        upcoming: true,
      },
      {
        label: 'Epargnes',
        to: ROUTES.savings,
        icon: PiggyBank,
        permissions: [PERMISSIONS.WALLET_READ],
        upcoming: true,
      },
      {
        label: 'Solidarite',
        to: ROUTES.solidarity,
        icon: HeartHandshake,
        permissions: [PERMISSIONS.CAGNOTTE_READ],
        upcoming: true,
      },
    ],
  },
  {
    label: 'Support',
    items: [
      {
        label: 'Litiges',
        to: ROUTES.disputes,
        icon: AlertOctagon,
        permissions: [PERMISSIONS.DISPUTE_READ],
        upcoming: true,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Journal d’audit',
        to: ROUTES.audit,
        icon: ClipboardList,
        permissions: [PERMISSIONS.AUDIT_READ],
      },
      {
        label: 'Comptes staff',
        to: ROUTES.staff,
        icon: ShieldCheck,
        permissions: [PERMISSIONS.STAFF_MANAGE],
      },
      {
        label: 'Parametres',
        to: ROUTES.settings,
        icon: Settings,
        permissions: [PERMISSIONS.SETTINGS_WRITE],
        upcoming: true,
      },
    ],
  },
];

/** Libelles de fil d'Ariane par segment de chemin. */
export const BREADCRUMB_LABELS: Record<string, string> = {
  'tableau-de-bord': 'Tableau de bord',
  utilisateurs: 'Utilisateurs',
  kyc: 'Verification KYC',
  portefeuilles: 'Portefeuilles',
  transactions: 'Transactions',
  tontines: 'Tontines',
  cagnottes: 'Cagnottes',
  epargnes: 'Epargnes',
  solidarite: 'Solidarite',
  litiges: 'Litiges',
  audit: 'Journal d’audit',
  staff: 'Comptes staff',
  parametres: 'Parametres',
  'acces-refuse': 'Acces refuse',
};
