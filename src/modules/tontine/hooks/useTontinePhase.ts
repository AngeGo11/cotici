import { useEffect, useState } from 'react';
import {
  getTontinePhaseState,
  subscribeTontinePhase,
  type TontinePhaseState,
} from '../data/tontinePhase';

export function useTontinePhase(tontineId: string | undefined): TontinePhaseState | undefined {
  const [, setTick] = useState(0);

  useEffect(() => subscribeTontinePhase(() => setTick((n) => n + 1)), []);

  if (!tontineId) {
    return undefined;
  }
  return getTontinePhaseState(tontineId);
}
