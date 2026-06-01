import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchArchivedSavingsGoals, savingsGoalToUi } from '@/shared/api';
import type { SavingsGoalUi } from './useSavingsGoals';

export function useArchivedSavingsGoals() {
  const [goals, setGoals] = useState<SavingsGoalUi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchArchivedSavingsGoals();
    if (result.ok) {
      setGoals(result.data.results.map(savingsGoalToUi));
    } else {
      setGoals([]);
      setError(result.detail);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { goals, loading, error, reload: load };
}
