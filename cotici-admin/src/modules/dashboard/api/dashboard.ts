import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { DashboardStats, TimeSeriesPoint } from '@/lib/api/types';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
  series: (metric: string, days: number) =>
    [...dashboardKeys.all, 'series', metric, days] as const,
};

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => api.get<DashboardStats>(endpoints.dashboard.stats),
    // Indicateurs operationnels : rafraichis regulierement.
    refetchInterval: 60_000,
  });
}

export function useDashboardSeries(metric: string, days = 30) {
  return useQuery({
    queryKey: dashboardKeys.series(metric, days),
    queryFn: () =>
      api.get<TimeSeriesPoint[]>(endpoints.dashboard.series, {
        params: { metric, days },
      }),
  });
}
