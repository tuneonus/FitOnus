import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { settingsApi } from '../api/settings-api';
import type { UserSettingsView, UpdateSettingsPayload } from '../types/profile';
import { useSettingsStore } from '@/shared/stores/settingsStore';

export const SETTINGS_QUERY_KEY = ['settings'] as const;

export function syncStoreWithSettings(s: UserSettingsView) {
  useSettingsStore.getState().setUnits(s.unitSystem);
  useSettingsStore.getState().setTheme(s.themeMode);
}

export function useSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<UserSettingsView>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const settings = await settingsApi.getSettings();
      syncStoreWithSettings(settings);
      return settings;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation<UserSettingsView, Error, UpdateSettingsPayload>({
    mutationFn: (payload) => settingsApi.updateSettings(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updated);
      syncStoreWithSettings(updated);
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
}

