/**
 * Helpers autour de l'ordre de ramassage d'une tontine de groupe.
 * Alimentés par les champs réels de l'API (`TontineSummary` / `TontineDetail`
 * dans `@/shared/api`) — `phase`, `ordre_mode`, `ordre_publie`.
 */
import type { TontinePhase } from '@/shared/api';

export type OrdreRamassageMode = 'admin' | 'random' | null;

/** Le CTA « Définir l'ordre de ramassage » doit apparaître pour l'admin
 * lorsque le groupe est complet, en mode "admin" et que l'ordre n'a pas
 * encore été publié — c'est exactement la phase `awaiting_ordre` côté API. */
export function needsDefineOrdre(params: {
  phase: TontinePhase;
  ordreMode: OrdreRamassageMode;
  ordrePublie: boolean;
  isAdmin: boolean;
}): boolean {
  return (
    params.isAdmin &&
    params.ordreMode === 'admin' &&
    params.phase === 'awaiting_ordre' &&
    !params.ordrePublie
  );
}

export const ORDRE_LOCK_MESSAGE =
  "L'ordre de ramassage a été publié et ne peut plus être modifié. Seuls le montant, la fréquence et les autres règles restent modifiables.";

export const ORDRE_RANDOM_EXPLANATION =
  "Ordre aléatoire : le bénéficiaire de chaque tour est tiré au sort automatiquement au moment du tour. Aucun rang n'est fixé à l'avance.";
