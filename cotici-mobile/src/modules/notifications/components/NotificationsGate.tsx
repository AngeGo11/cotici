import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { markNotificationRead } from '@/shared/api';
import {
  resolveNotificationRoute,
  type PushDataPayload,
} from '@/modules/notifications/services/notificationRouting';
import { requestUnreadCountRefresh } from '@/modules/notifications/services/unreadCountBus';

// Décide si/comment afficher une notification reçue pendant que l'app est au
// premier plan : on l'affiche toujours (bannière + entrée dans la liste
// système), sans son forcé au-delà du réglage par défaut de l'appareil.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Composant sans rendu, monté une fois au niveau racine : gère la réception
 * des notifications (foreground) et le deep-link au tap, y compris pour le
 * cas « app tuée puis ouverte via la notification » (via
 * `useLastNotificationResponse`, qui couvre le cold start ET le tap en
 * live/arrière-plan). */
export function NotificationsGate() {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);

  // Réception en foreground : on ne route pas (l'utilisateur est déjà dans
  // l'app), on se contente de rafraîchir le badge de non-lus.
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      requestUnreadCountRefresh();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!lastResponse) return;
    const identifier = lastResponse.notification.request.identifier;
    if (handledResponseId.current === identifier) return;
    handledResponseId.current = identifier;

    const data = (lastResponse.notification.request.content.data ?? {}) as PushDataPayload;

    void (async () => {
      const notificationId = data.notification_id;
      if (notificationId != null) {
        const numericId = Number(notificationId);
        if (Number.isFinite(numericId)) {
          await markNotificationRead(numericId).catch(() => null);
        }
      }
      requestUnreadCountRefresh();

      const route = resolveNotificationRoute(data);
      if (route) {
        router.push(route as never);
      }
    })();
  }, [lastResponse, router]);

  return null;
}
