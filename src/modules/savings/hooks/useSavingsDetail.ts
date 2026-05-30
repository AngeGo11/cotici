import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchSavingsDetail, parseBalance, type SavingsGoal } from '@/shared/api';

export type SavingsDetailUi = {
  id: string;
  name: string;
  category: string;
  saved: number;
  target: number;
  percentage: number;
  remaining: number;
  durationMonths: number;
  monthsRemaining: number;
  monthlyAmount: number;
  dateCreation: string;
};

function monthsSince(dateStr: string): number {
  const start = new Date(dateStr);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  return Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()),
  );
}

export function savingsDetailToUi(goal: SavingsGoal): SavingsDetailUi {
  const saved = parseBalance(goal.montant_courant);
  const target = goal.objectif_cotisation;
  const percentage =
    target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const elapsed = monthsSince(goal.date_creation);
  const monthsRemaining = Math.max(0, goal.duree - elapsed);
  const remaining = Math.max(0, target - saved);
  const monthlyAmount =
    monthsRemaining > 0 ? Math.ceil(remaining / monthsRemaining) : 0;

  return {
    id: String(goal.id),
    name: goal.nom_projet,
    category: goal.categorie || '',
    saved,
    target,
    percentage,
    remaining,
    durationMonths: goal.duree,
    monthsRemaining,
    monthlyAmount,
    dateCreation: goal.date_creation,
  };
}

export function useSavingsDetail(goalId: string | undefined) {
  const [detail, setDetail] = useState<SavingsDetailUi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!goalId) {
      setDetail(null);
      setError('Objectif introuvable.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await fetchSavingsDetail(goalId);
    if (result.ok) {
      setDetail(savingsDetailToUi(result.data));
    } else {
      setDetail(null);
      setError(result.detail);
    }
    setLoading(false);
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { detail, loading, error, reload: load };
}
