import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchWalletTransactions } from '@/shared/api';
import { mapTransactionForUi } from '@/shared/api/mapWalletTransaction';
import { getAccessToken } from '@/shared/auth';
import type { ActivityDetail } from '@/types';

export function useWalletActivities() {
  const [activities, setActivities] = useState<ActivityDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getAccessToken();
    if (!token) {
      setActivities([]);
      setLoading(false);
      return;
    }
    const result = await fetchWalletTransactions(token);
    if (result.ok) {
      setActivities(result.data.results.map(mapTransactionForUi));
    } else {
      setError(result.detail);
      setActivities([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const getById = useCallback(
    (id: string) => activities.find((a) => a.id === id),
    [activities],
  );

  return { activities, loading, error, reload: load, getById };
}
