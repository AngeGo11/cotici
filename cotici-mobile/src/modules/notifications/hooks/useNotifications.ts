import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  fetchNotifications,
  mapNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/shared/api';
import type { AppNotification } from '@/types';

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchNotifications();
    if (result.ok) {
      setItems(result.data.results.map(mapNotification));
    } else {
      setError(result.detail);
      setItems([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const markOneRead = useCallback(async (id: string) => {
    const numericId = Number(id);
    let previous: AppNotification | undefined;
    setItems((prev) => {
      previous = prev.find((n) => n.id === id);
      return prev.map((n) => (n.id === id ? { ...n, estLue: true } : n));
    });
    if (previous?.estLue) return true;
    const result = await markNotificationRead(numericId);
    if (!result.ok) {
      // Rollback en cas d'échec.
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, estLue: false } : n)));
      return false;
    }
    return true;
  }, []);

  const markAllRead = useCallback(async () => {
    const result = await markAllNotificationsRead();
    if (result.ok) {
      await load();
    }
    return result.ok;
  }, [load]);

  return { items, loading, error, reload: load, markOneRead, markAllRead };
}
