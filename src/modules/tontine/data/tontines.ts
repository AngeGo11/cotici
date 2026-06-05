import { Colors, withOpacity } from '@/shared/theme/Colors';
import {
  getTontinePhaseState,
  isVisibleInTontineList,
  type TontinePhase,
} from './tontinePhase';

export type UserTontine = {
  id: string;
  name: string;
  members: number;
  turn: string;
  /** Montant mensuel affiché sur la carte liste */
  amount: number;
  /** Montant d'une cotisation individuelle */
  cotisationAmount: number;
  status: 'active' | 'paused';
  isSolidarity: boolean;
  /** Phase UX — recruiting n'apparaît pas dans la liste */
  phase: TontinePhase;
  nombreMax: number;
};

/** Données de démo — à remplacer par l'API */
export const USER_TONTINES: UserTontine[] = [
  {
    id: '1',
    name: 'Tontine Famille',
    members: 8,
    turn: '3/8',
    amount: 80_000,
    cotisationAmount: 10_000,
    status: 'active',
    isSolidarity: false,
    phase: 'active',
    nombreMax: 8,
  },
  {
    id: '2',
    name: 'Tontine Entrepreneurs',
    members: 8,
    turn: '0/8',
    amount: 80_000,
    cotisationAmount: 10_000,
    status: 'active',
    isSolidarity: false,
    phase: 'awaiting_ordre',
    nombreMax: 8,
  },
  {
    id: '3',
    name: 'Tontine Solidaire Commerçants',
    members: 6,
    turn: '2/6',
    amount: 50_000,
    cotisationAmount: 8_334,
    status: 'active',
    isSolidarity: true,
    phase: 'active',
    nombreMax: 6,
  },
];

export function getTontineById(id: string): UserTontine | undefined {
  return USER_TONTINES.find((t) => t.id === id);
}

/** Tontines visibles une fois le groupe complet (hors recrutement) */
export function getTontinesForList(): UserTontine[] {
  return USER_TONTINES.filter((t) => {
    if (t.isSolidarity) {
      return true;
    }
    const live = getTontinePhaseState(t.id);
    const phase = live?.phase ?? t.phase;
    return isVisibleInTontineList(phase);
  });
}

export function getActiveTontinesForCotisation(): UserTontine[] {
  return USER_TONTINES.filter((t) => {
    if (t.status !== 'active' || t.isSolidarity) {
      return false;
    }
    const live = getTontinePhaseState(t.id);
    const phase = live?.phase ?? t.phase;
    if (phase === 'completed') {
      return false;
    }
    return phase === 'active' || (live?.ordrePublie ?? t.phase === 'active');
  });
}

export function parseTurn(turn: string): { current: number; total: number; pct: number } {
  const parts = turn.split('/').map((x) => parseInt(x, 10));
  const current = parts[0] || 0;
  const total = parts[1] || 1;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return { current, total, pct };
}

export function getTontineListBadge(
  tontine: UserTontine,
): { label: string; color: string; bg: string } | null {
  if (tontine.isSolidarity) {
    return null;
  }
  const live = getTontinePhaseState(tontine.id);
  const phase = live?.phase ?? tontine.phase;
  if (phase === 'awaiting_ordre') {
    return {
      label: 'Ordre à définir',
      color: Colors.accent,
      bg: withOpacity(Colors.accent, 0.12),
    };
  }
  if (phase === 'active') {
    return {
      label: 'Actif',
      color: Colors.success,
      bg: withOpacity(Colors.success, 0.12),
    };
  }
  if (phase === 'completed') {
    return {
      label: 'Terminée',
      color: Colors.success,
      bg: withOpacity(Colors.success, 0.12),
    };
  }
  return null;
}
