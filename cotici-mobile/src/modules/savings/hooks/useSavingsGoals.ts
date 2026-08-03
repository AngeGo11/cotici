import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchSavingsGoals, savingsGoalToUi } from '@/shared/api/savingsApi';

export type SavingsGoalUi = ReturnType<typeof savingsGoalToUi>;

export function useSavingsGoals() {
  const [goals, setGoals] = useState<SavingsGoalUi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchSavingsGoals();
    if (result.ok) {
      setGoals(result.data.results.map(savingsGoalToUi));
    } else {
      setError(result.detail);
      setGoals([]);
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
