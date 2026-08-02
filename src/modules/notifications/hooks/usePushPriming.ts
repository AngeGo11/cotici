import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPushPermissionStatus,
  isPushCapableDevice,
  requestPushPermissionAndRegister,
} from '@/modules/notifications/services/pushRegistration';
import { hasShownPushPriming, markPushPrimingShown } from '@/modules/notifications/services/pushStorage';

/** Orchestre l'affichage ponctuel de la modale de « priming » avant le
 * prompt système. Appeler `maybeShowPriming()` juste après une première
 * action de valeur (ex. écran de succès création tontine/épargne/cotisation).
 * Ne fait rien si : simulateur, permission déjà tranchée (accordée ou
 * refusée), ou priming déjà montré une fois. */
export function usePushPriming() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const maybeShowPriming = useCallback(async () => {
    if (!isPushCapableDevice()) return;
    const alreadyShown = await hasShownPushPriming();
    if (alreadyShown) return;
    const status = await getPushPermissionStatus();
    if (status !== 'undetermined') {
      // Déjà accordée ou refusée ailleurs (réglages système) : rien à primer.
      await markPushPrimingShown();
      return;
    }
    if (isMountedRef.current) setVisible(true);
  }, []);

  const handleActivate = useCallback(async () => {
    setLoading(true);
    await requestPushPermissionAndRegister();
    await markPushPrimingShown();
    setLoading(false);
    if (isMountedRef.current) setVisible(false);
  }, []);

  const handleDismiss = useCallback(() => {
    void markPushPrimingShown();
    setVisible(false);
  }, []);

  return { visible, loading, maybeShowPriming, handleActivate, handleDismiss };
}
