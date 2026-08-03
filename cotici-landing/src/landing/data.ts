import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Heart,
  History,
  QrCode,
  RefreshCw,
  Shield,
  Target,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';

export const NAV_LINKS = [
  { href: '#accueil', label: 'Accueil' },
  { href: '#modes', label: 'Nos modes' },
  { href: '#faq', label: 'FAQ' },
] as const;

export type ModeId = 'groupe' | 'solidaire' | 'cagnotte' | 'epargne';

export type ModeMockupKey =
  | 'tontine-groupe'
  | 'tontine-groupe-pt2'
  | 'tontine-solidaire'
  | 'cagnotte-association'
  | 'mon-epargne';

/** Parcours et fonctionnalités par mode. */
export const MODE_JOURNEYS: {
  id: ModeId;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  essence: string;
  difference: string;
  steps: { title: string; description: string }[];
  features: { icon: LucideIcon; title: string; description: string }[];
  mockupKey: ModeMockupKey;
  mockupKeySecondary?: ModeMockupKey;
}[] = [
  {
    id: 'groupe',
    label: 'Tontine de groupe',
    shortLabel: 'Groupe',
    icon: Users,
    essence: 'Un pot commun : tout le monde cotise, un membre ramasse à chaque tour.',
    difference: 'Tours de rôle · Mise identique · Ordre de ramassage',
    mockupKey: 'tontine-groupe',
    mockupKeySecondary: 'tontine-groupe-pt2',
    steps: [
      {
        title: 'Créez le groupe',
        description: 'Nom, montant de la mise et fréquence des cotisations (jour, semaine, mois).',
      },
      {
        title: 'Fixez les règles du cycle',
        description: 'Ordre de ramassage aléatoire ou défini par l’admin, pénalités en cas de retard.',
      },
      {
        title: 'Invitez votre cercle',
        description: 'Membres fixes : chacun cotise et ramasse à son tour, sur le même cycle.',
      },
      {
        title: 'Cotisez, puis ramassez',
        description: 'À chaque période, les cotisations alimentent le pot du bénéficiaire du tour.',
      },
    ],
    features: [
      {
        icon: RefreshCw,
        title: 'Tours de ramassage',
        description: 'Ordre admin ou aléatoire, suivi du cycle en temps réel.',
      },
      {
        icon: UserPlus,
        title: 'Invitations simplifiées',
        description: 'Rejoignez le groupe par lien ou QR code en quelques secondes.',
      },
      {
        icon: History,
        title: 'Règles & historique',
        description: 'Cotisations, pénalités et mouvements visibles pour tous les membres.',
      },
    ],
  },
  {
    id: 'solidaire',
    label: 'Tontine solidaire',
    shortLabel: 'Solidaire',
    icon: Heart,
    essence: 'De l’entraide autour d’un bénéficiaire : la cagnotte tourne, l’urgence se vote.',
    difference: 'Bénéficiaire désigné · Fonds d’urgence · Gouvernance collective',
    mockupKey: 'tontine-solidaire',
    steps: [
      {
        title: 'Définissez le bénéficiaire',
        description: 'Qui est aidé, pour quel motif (santé, décès, études…) — pas un simple tour de rôle.',
      },
      {
        title: 'Le groupe se constitue',
        description: 'Les membres rejoignent la solidarité et acceptent le règlement partagé.',
      },
      {
        title: 'La cagnotte tourne',
        description: 'Chacun bénéficie du pot selon l’ordre convenu, comme une entraide de quartier.',
      },
      {
        title: 'Urgence si besoin',
        description: 'Un fonds peut être débloqué collectivement pour les situations critiques.',
      },
    ],
    features: [
      {
        icon: RefreshCw,
        title: 'Cagnotte tournante',
        description: 'Chaque membre bénéficie du pot selon l’ordre défini par le groupe.',
      },
      {
        icon: Shield,
        title: "Fonds d'urgence",
        description: 'Aide validée collectivement pour les situations critiques.',
      },
      {
        icon: Users,
        title: 'Gouvernance collective',
        description: 'Règlement partagé et décisions transparentes pour tous.',
      },
    ],
  },
  {
    id: 'cagnotte',
    label: 'Cagnotte association',
    shortLabel: 'Cagnotte',
    icon: Building2,
    essence: 'Une collecte ouverte vers un objectif : club, école, mosquée, événement.',
    difference: 'Collecte ouverte · Pas de tour de rôle · Objectif commun visible',
    mockupKey: 'cagnotte-association',
    steps: [
      {
        title: 'Lancez la collecte',
        description: 'Objectif en FCFA, description du projet et catégorie (religion, sport, santé…).',
      },
      {
        title: 'Partagez largement',
        description: 'Lien ou QR : sympathisants et membres cotisent sans être « dans la tontine » au sens classique.',
      },
      {
        title: 'Chaque don est tracé',
        description: 'Contributions visibles en direct — transparence pour l’association et les donateurs.',
      },
      {
        title: 'Atteignez l’objectif',
        description: 'Barre de progression commune : pas de ramassage individuel à tour de rôle.',
      },
    ],
    features: [
      {
        icon: QrCode,
        title: 'Collecte ouverte',
        description: 'Partagez un lien de contribution à tous vos sympathisants.',
      },
      {
        icon: Wallet,
        title: 'Suivi des dons',
        description: 'Chaque contribution est enregistrée et consultable en direct.',
      },
      {
        icon: History,
        title: 'Transparence totale',
        description: 'Les membres voient l’avancement vers l’objectif commun.',
      },
    ],
  },
  {
    id: 'epargne',
    label: 'Épargne personnelle',
    shortLabel: 'Épargne',
    icon: Target,
    essence: 'Votre tirelire perso : objectif, dépôts libres, sans groupe ni tour de rôle.',
    difference: 'Seul · À votre rythme · Pas d’invitation obligatoire',
    mockupKey: 'mon-epargne',
    steps: [
      {
        title: 'Fixez votre objectif',
        description: 'Montant cible, durée et catégorie (voyage, mariage, urgence…).',
      },
      {
        title: 'Épargnez quand vous voulez',
        description: 'Dépôts via Mobile Money, sans calendrier imposé par un groupe.',
      },
      {
        title: 'Suivez votre progression',
        description: 'Barres et pourcentages — vous n’attendez pas « votre tour » pour retirer.',
      },
      {
        title: 'Atteignez votre but',
        description: 'L’argent reste le vôtre : pas de pot partagé ni de bénéficiaire du mois.',
      },
    ],
    features: [
      {
        icon: Target,
        title: 'Objectifs sur mesure',
        description: 'Vacances, urgence, projet perso — fixez un montant cible.',
      },
      {
        icon: RefreshCw,
        title: 'Progression visuelle',
        description: 'Barres et pourcentages pour rester motivé jusqu’au bout.',
      },
      {
        icon: Wallet,
        title: 'Dépôts flexibles',
        description: 'Alimentez votre épargne quand vous voulez, via Mobile Money.',
      },
    ],
  },
];

export const MODE_COMPARISON = [
  { id: 'groupe' as const, highlight: 'Tours de rôle' },
  { id: 'solidaire' as const, highlight: 'Entraide ciblée' },
  { id: 'cagnotte' as const, highlight: 'Collecte ouverte' },
  { id: 'epargne' as const, highlight: 'Épargne solo' },
] as const;

export const FOOTER_LINKS = {
  quick: [
    { label: 'Accueil', href: '#accueil' },
    { label: 'Nos modes', href: '#modes' },
    { label: 'FAQ', href: '#faq' },
  ],
  about: [
    { label: 'Fonctionnalités', href: '#fonctionnalites' },
    { label: 'Mobile Money', href: '#modes' },
    { label: 'Télécharger', href: '#telecharger' },
  ],
};
