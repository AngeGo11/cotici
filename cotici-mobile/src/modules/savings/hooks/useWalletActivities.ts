import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchSavingsTransactions } from '@/shared/api';
import { mapSavingsDepositForUi } from '@/shared/api/mapWalletTransaction';
import type { ActivityDetail } from '@/types';

export function useSavingsTransactions(goalId: string | undefined) {
  const [transactions, setTransactions] = useState<ActivityDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!goalId) {
      setTransactions([]);
      setError('Objectif introuvable.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await fetchSavingsTransactions(goalId);
    if (result.ok) {
      setTransactions(result.data.results.map(mapSavingsDepositForUi));
    } else {
      setTransactions([]);
      setError(result.detail);
    }
    setLoading(false);
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const getByRef = useCallback(
    (ref: string) =>
      transactions.find((tx) => tx.id === ref || tx.reference === ref),
    [transactions],
  );

  return { transactions, loading, error, reload: load, getByRef };
}
