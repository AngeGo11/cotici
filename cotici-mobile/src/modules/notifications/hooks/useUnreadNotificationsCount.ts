import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchUnreadCount } from '@/shared/api';
import { subscribeUnreadCountRefresh } from '@/modules/notifications/services/unreadCountBus';

const POLL_INTERVAL_MS = 25_000;

/** Compteur de notifications non lues, avec rafraîchissement au focus et
 * un polling léger (ce n'est qu'un badge, pas du temps réel critique). */
export function useUnreadNotificationsCount() {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchUnreadCount();
    if (result.ok) {
      setUnreadCount(result.data.unread);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      intervalRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }, [refresh]),
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Rafraîchissement immédiat (push reçu, notification marquée lue via le
  // deep-link handler) sans attendre le prochain focus ou tick de polling.
  useEffect(() => subscribeUnreadCountRefresh(() => void refresh()), [refresh]);

  return unreadCount;
}
