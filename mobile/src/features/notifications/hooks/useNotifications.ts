import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useAuthStore } from '../../auth/stores/auth-store';
import { getNotificationRuntime } from '../services/notification-runtime';
import type { PushState } from '../services/notification-coordinator';
import type { NotificationPermissionState } from '../types/push';

/**
 * Read-only status + the explicit user-action entry points for notifications.
 *
 * Nothing here prompts on its own: `enable()` is the only function that can show
 * the OS permission dialog, and it must be called from a press handler.
 * (No existing screen calls it yet; see `docs/push-notifications.md`.)
 */
export function useNotifications() {
  const runtime = getNotificationRuntime();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [push, setPush] = useState<PushState>(() => runtime.coordinator.getState());
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);

  useEffect(() => runtime.coordinator.subscribe(setPush), [runtime]);

  const refreshPermission = useCallback(async () => {
    setPermission(await runtime.coordinator.getPermission());
  }, [runtime]);

  useEffect(() => {
    void refreshPermission();
    // The user may flip the permission in system settings while the app is backgrounded.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  /** Request OS permission and register for push. Call from a user gesture only. */
  const enable = useCallback(async () => {
    if (!userId) return null;
    const result = await runtime.coordinator.enablePushFromUserAction(userId);
    setPermission(result.permission);
    return result;
  }, [runtime, userId]);

  const openSystemSettings = useCallback(() => Linking.openSettings(), []);

  return { permission, push, enable, openSystemSettings, refreshPermission };
}
