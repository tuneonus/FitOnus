import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../auth/stores/auth-store';
import {
  createCategoryPreferenceController,
  type CategoryPreferenceState,
} from '../services/notification-category-preferences';
import type { ServerCategory } from '../services/notification-inbox-api';
import { getNotificationRuntime } from '../services/notification-runtime';

/**
 * Per-category push choices ("Announcements", "Challenges", ...), kept in sync with the server.
 * The master switch and the local reminder settings are unchanged and live in the settings store.
 */
export function useServerCategoryPreferences() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const controller = useMemo(() => createCategoryPreferenceController(getNotificationRuntime().inboxApi), []);
  const [state, setState] = useState<CategoryPreferenceState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    if (isAuthenticated) void controller.load();
  }, [controller, isAuthenticated]);

  const toggle = useCallback((key: ServerCategory) => controller.toggle(key), [controller]);
  const reload = useCallback(() => controller.load(), [controller]);
  return { ...state, toggle, reload };
}
