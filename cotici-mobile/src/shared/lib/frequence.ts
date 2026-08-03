/**
 * Libellés et formatage de la fréquence de cotisation d'une tontine.
 *
 * Source de vérité des valeurs : `TontineRegle.FREQUENCE_COTISATION` dans
 * `cotici-backend/apps/tontine/models.py`. Toute nouvelle fréquence ajoutée
 * côté Django doit l'être ici aussi, sinon l'UI affiche la valeur brute.
 */

/** Valeurs émises par le backend. */
export type Frequence = 'JOURNALIER' | 'HEBDOMADAIRE' | 'MENSUEL' | 'PERSONNALISÉE';

const LABELS: Record<string, string> = {
  JOURNALIER: 'Journalière',
  HEBDOMADAIRE: 'Hebdomadaire',
  MENSUEL: 'Mensuelle',
  PERSONNALISÉE: 'Personnalisée',
};

/** Complément par tour, pour suffixer un montant : « 5 000 F par mois ». */
const UNITES: Record<string, string> = {
  JOURNALIER: 'par jour',
  HEBDOMADAIRE: 'par semaine',
  MENSUEL: 'par mois',
};

function isPersonnalisee(frequence: string): boolean {
  // Le préfixe suffit et évite le piège de l'accent : la valeur canonique est
  // `PERSONNALISÉE`, mais les graphies `PERSONNALISE` / `PERSONALISE` traînent
  // dans d'anciens écrans et payloads.
  return frequence.toUpperCase().startsWith('PERSON');
}

/**
 * Libellé lisible d'une fréquence : « Journalière », « Tous les 5 jours »…
 * Retourne `fallback` quand la fréquence est absente, et la valeur brute
 * quand elle est inconnue (préférable à un libellé vide qui masquerait le bug).
 */
export function frequenceLabel(
  frequence: string | null | undefined,
  joursPersonnalises?: number | null,
  fallback = '—',
): string {
  if (!frequence) return fallback;
  if (isPersonnalisee(frequence)) {
    return joursPersonnalises ? `Tous les ${joursPersonnalises} jours` : 'Personnalisée';
  }
  return LABELS[frequence] ?? frequence;
}

/**
 * Unité de temps à accoler à un montant (« par mois »), ou `null` si elle ne
 * peut pas être déterminée — l'appelant affiche alors le montant seul.
 */
export function frequenceUnite(
  frequence: string | null | undefined,
  joursPersonnalises?: number | null,
): string | null {
  if (!frequence) return null;
  if (isPersonnalisee(frequence)) {
    return joursPersonnalises ? `tous les ${joursPersonnalises} jours` : null;
  }
  return UNITES[frequence] ?? null;
}

/**
 * Formate l'échéance d'un tour en texte relatif (« Demain », « Retard de
 * 2 jours »), avec repli sur une date absolue au-delà d'une semaine.
 * `null` si l'échéance est absente — le backend la laisse vide tant qu'elle
 * n'est pas calculable (fréquence personnalisée sans nombre de jours).
 */
export function formatEcheance(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const echeance = new Date(iso);
  if (Number.isNaN(echeance.getTime())) return null;

  // Différence en jours calendaires : « demain à 8h » doit rester « Demain »
  // même s'il reste moins de 24 h.
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const jours = Math.round((startOfDay(echeance) - startOfDay(now)) / 86_400_000);

  if (jours === 0) return "Aujourd'hui";
  if (jours === 1) return 'Demain';
  if (jours === -1) return 'Hier';
  if (jours < 0) return `Retard de ${-jours} jours`;
  if (jours <= 7) return `Dans ${jours} jours`;
  return echeance.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `true` si l'échéance est dépassée. `false` si elle est absente ou invalide. */
export function echeanceDepassee(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const echeance = new Date(iso);
  if (Number.isNaN(echeance.getTime())) return false;
  return echeance.getTime() < now.getTime();
}
