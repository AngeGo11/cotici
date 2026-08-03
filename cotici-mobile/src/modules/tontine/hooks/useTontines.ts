import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchTontines, tontineSummaryToUi } from '@/shared/api';

export type TontineListItem = ReturnType<typeof tontineSummaryToUi>;

export function useTontines() {
  const [tontines, setTontines] = useState<TontineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchTontines();
    if (result.ok) {
      setTontines(result.data.results.map(tontineSummaryToUi));
    } else {
      setTontines([]);
      setError(result.detail);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { tontines, loading, error, reload: load };
}
