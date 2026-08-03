import { useMemo } from 'react';
import type { TontinePhase } from '@/shared/api';
import { useTontineDetail } from './useTontineDetail';
import type { OrdreRamassageMode } from '../utils/ordreRamassage';

export type TontinePhaseState = {
  phase: TontinePhase;
  nombreMax: number;
  membresActifs: number;
  ordreMode: OrdreRamassageMode;
  ordrePublie: boolean;
  isAdmin: boolean;
};

/**
 * Expose la phase réelle d'une tontine de groupe (recruiting / awaiting_ordre
 * / active / completed) telle que calculée côté API (`compute_phase`), avec
 * les états loading / error / reload standards.
 */
export function useTontinePhase(tontineId: string | undefined) {
  const { detail, loading, error, reload } = useTontineDetail(tontineId);

  const phaseState: TontinePhaseState | undefined = useMemo(() => {
    if (!detail) return undefined;
    return {
      phase: detail.phase,
      nombreMax: detail.nombre_max,
      membresActifs: detail.membres_actifs,
      ordreMode: detail.ordre_mode,
      ordrePublie: detail.ordre_publie,
      isAdmin: detail.is_admin,
    };
  }, [detail]);

  return { phaseState, loading, error, reload };
}
