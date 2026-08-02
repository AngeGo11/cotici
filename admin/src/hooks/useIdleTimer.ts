import { useCallback, useEffect, useRef, useState } from 'react';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from '@/lib/constants';

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'focus',
];

export interface IdleTimerOptions {
  timeout?: number;
  warningBefore?: number;
  enabled?: boolean;
  /** Appelee une seule fois lorsque le delai est ecoule. */
  onIdle: () => void;
}

export interface IdleTimerState {
  /** Millisecondes restantes avant deconnexion automatique. */
  remaining: number;
  /** Vrai lorsque l'on entre dans la fenetre d'avertissement. */
  isWarning: boolean;
  /** Reinitialise manuellement le compteur. */
  reset: () => void;
}

/**
 * Minuteur d'inactivite du back-office : au-dela du delai, la session est
 * fermee. Le serveur applique de toute facon sa propre expiration de session ;
 * ce minuteur est une protection d'affichage (poste laisse sans surveillance).
 */
export function useIdleTimer({
  timeout = IDLE_TIMEOUT_MS,
  warningBefore = IDLE_WARNING_MS,
  enabled = true,
  onIdle,
}: IdleTimerOptions): IdleTimerState {
  const [remaining, setRemaining] = useState(timeout);
  const lastActivityRef = useRef(Date.now());
  const firedRef = useRef(false);
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    firedRef.current = false;
    setRemaining(timeout);
  }, [timeout]);

  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      if (firedRef.current) return;
      lastActivityRef.current = Date.now();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const left = Math.max(0, timeout - elapsed);
      setRemaining(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        onIdleRef.current();
      }
    }, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      window.clearInterval(interval);
    };
  }, [enabled, timeout]);

  return { remaining, isWarning: remaining <= warningBefore, reset };
}
