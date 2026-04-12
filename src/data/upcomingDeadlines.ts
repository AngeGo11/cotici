export type UpcomingDeadline = {
  id: string;
  /** Libellé principal affiché dans les listes */
  title: string;
  /** Montant à payer ou à verser */
  amountF: number;
  /** Texte relatif (ex. « dans 3 jours ») ou date */
  dueRelative: string;
  /** Sous-type pour l’icône / navigation future */
  kind: 'tontine' | 'epargne' | 'solidaire';
};

/** Données de démo — à remplacer par l’API */
export const UPCOMING_DEADLINES: UpcomingDeadline[] = [
  {
    id: '1',
    title: 'Cotisation — Tontine Famille',
    amountF: 10000,
    dueRelative: 'dans 3 jours',
    kind: 'tontine',
  },
  {
    id: '2',
    title: 'Versement objectif — Vacances Abidjan',
    amountF: 25000,
    dueRelative: 'dans 5 jours',
    kind: 'epargne',
  },
  {
    id: '3',
    title: 'Cotisation — Tontine Entrepreneurs',
    amountF: 120000,
    dueRelative: 'dans 8 jours',
    kind: 'tontine',
  },
];
