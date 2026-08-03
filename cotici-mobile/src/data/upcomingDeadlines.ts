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
  /** Référence tontine (cotisation) */
  tontineId?: string;
  tontineName?: string;
  turn?: string;
};

/** Données de démo — à remplacer par l’API */
export const UPCOMING_DEADLINES: UpcomingDeadline[] = [
  {
    id: '1',
    title: 'Cotisation — Tontine Famille',
    amountF: 10000,
    dueRelative: 'dans 3 jours',
    kind: 'tontine',
    tontineId: '1',
    tontineName: 'Tontine Famille',
    turn: '3',
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
    amountF: 10000,
    dueRelative: 'dans 8 jours',
    kind: 'tontine',
    tontineId: '2',
    tontineName: 'Tontine Entrepreneurs',
    turn: '5',
  },
];

/** Extrait un nombre de jours restants depuis `dueRelative` (ex. "dans 3
 * jours" → 3, "aujourd'hui" → 0). `null` si non parsable — donnée de démo
 * texte libre, à remplacer par une vraie date d'échéance côté API. */
export function parseDueInDays(dueRelative: string): number | null {
  if (/aujourd/i.test(dueRelative)) return 0;
  const match = dueRelative.match(/dans\s+(\d+)\s+jour/i);
  if (match) return Number(match[1]);
  return null;
}

/** Échéance la plus urgente parmi les prochaines (plus petit nombre de jours
 * restants), ou `undefined` si aucune n'est parsable. */
export function getMostUrgentDeadline(
  deadlines: UpcomingDeadline[],
): UpcomingDeadline | undefined {
  let best: { deadline: UpcomingDeadline; days: number } | undefined;
  for (const deadline of deadlines) {
    const days = parseDueInDays(deadline.dueRelative);
    if (days == null) continue;
    if (!best || days < best.days) {
      best = { deadline, days };
    }
  }
  return best?.deadline;
}
