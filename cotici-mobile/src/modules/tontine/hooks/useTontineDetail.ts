import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchTontineDetail, type TontineDetail } from '@/shared/api';

export function useTontineDetail(tontineId: string | undefined) {
  const [detail, setDetail] = useState<TontineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tontineId) {
      setDetail(null);
      setError('Tontine introuvable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchTontineDetail(tontineId);
    if (result.ok) {
      setDetail(result.data);
    } else {
      setDetail(null);
      setError(result.detail);
    }
    setLoading(false);
  }, [tontineId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { detail, loading, error, reload: load };
}
