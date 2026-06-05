/**
 * Phases UX du cycle de vie d'une tontine de groupe (démo locale).
 * recruiting → n'apparaît pas dans la liste
 * awaiting_ordre → groupe complet, ordre admin à publier
 * active → ordre verrouillé, cotisations / tours
 */

export type TontinePhase = 'recruiting' | 'awaiting_ordre' | 'active' | 'completed';

export type OrdreRamassageMode = 'admin' | 'random';

export type TontinePhaseState = {
  phase: TontinePhase;
  nombreMax: number;
  membresActifs: number;
  ordreMode: OrdreRamassageMode;
  ordrePublie: boolean;
};

const phaseById = new Map<string, TontinePhaseState>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** États initiaux pour la démo */
function seedPhaseState() {
  phaseById.set('1', {
    phase: 'active',
    nombreMax: 8,
    membresActifs: 8,
    ordreMode: 'admin',
    ordrePublie: true,
  });
  phaseById.set('2', {
    phase: 'awaiting_ordre',
    nombreMax: 8,
    membresActifs: 8,
    ordreMode: 'admin',
    ordrePublie: false,
  });
}

seedPhaseState();

export function subscribeTontinePhase(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTontinePhaseState(tontineId: string): TontinePhaseState | undefined {
  return phaseById.get(tontineId);
}

export function publishOrdreRamassage(tontineId: string): void {
  const state = phaseById.get(tontineId);
  if (!state || state.ordrePublie) {
    return;
  }
  phaseById.set(tontineId, {
    ...state,
    ordrePublie: true,
    phase: 'active',
  });
  notify();
}

export function isVisibleInTontineList(phase: TontinePhase): boolean {
  return phase !== 'recruiting';
}

export function needsDefineOrdre(state: TontinePhaseState): boolean {
  return (
    state.ordreMode === 'admin' &&
    state.membresActifs >= state.nombreMax &&
    !state.ordrePublie
  );
}

export const ORDRE_LOCK_MESSAGE =
  "L'ordre de ramassage a été publié et ne peut plus être modifié. Seuls le montant, la fréquence et les autres règles restent modifiables.";
