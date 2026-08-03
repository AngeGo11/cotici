import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { PlatformSetting, PlatformSettingsUpdatePayload } from '@/lib/api/types';

export const settingsEndpoints = endpoints.settings;

export const settingsKeys = {
  all: ['settings'] as const,
  list: () => [...settingsKeys.all, 'list'] as const,
};

/** Catalogue complet des reglages plateforme (toujours un jeu complet, meme sur une base vierge). */
export function useSettingsList() {
  return useQuery({
    queryKey: settingsKeys.list(),
    queryFn: () => api.get<PlatformSetting[]>(settingsEndpoints.read),
  });
}

/**
 * Ecrit un lot de reglages (mise a jour partielle : seules les cles fournies
 * dans `changes` sont modifiees). Un motif est exige cote serveur.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PlatformSettingsUpdatePayload) =>
      api.patch<PlatformSetting[]>(settingsEndpoints.write, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.list(), data);
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
