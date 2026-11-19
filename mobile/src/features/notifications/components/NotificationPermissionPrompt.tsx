import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { useRemoteConfigStore } from '../../app-config/store/remoteConfigStore';
import { useAuthStore } from '../../auth/stores/auth-store';
import {
  PERMISSION_PROMPT_COPY,
  PERMISSION_PROMPT_SETTLE_MS,
  hasAnsweredPermissionPrompt,
  markPermissionPromptAnswered,
  shouldOfferPermissionPrompt,
} from '../services/notification-permission-prompt';
import { getNotificationRuntime } from '../services/notification-runtime';
import { NAVIGATION_BLOCKED_ROUTES } from '../services/notification-routing';

/**
 * Asks, once per install, whether to allow notifications, then shows the Android system dialog.
 *
 * The system dialog is only ever opened from the "Allow notifications" press, so the coordinator's
 * "permission is requested from a user gesture only" rule still holds. Nothing here blocks sign-in or
 * app use: it never renders on the auth/onboarding screens, and "Not now" simply ends it.
 */
export function NotificationPermissionPrompt(): React.ReactElement | null {
  const navigation = useNavigation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const modalActive = useRemoteConfigStore((state) => state.isMaintenance || state.isForceUpdate);

  const [visible, setVisible] = useState(false);
  // Set as soon as the offer is shown so a re-render or route change can never queue a second one.
  const offeredRef = useRef(false);

  const signedIn = isAuthenticated && !isAuthLoading && userId !== null;
  const blocked = NAVIGATION_BLOCKED_ROUTES.has(navigation.route.name) || modalActive;

  useEffect(() => {
    if (!signedIn || blocked || offeredRef.current) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const { coordinator, store } = getNotificationRuntime();
        const [alreadyAnswered, permission] = await Promise.all([
          hasAnsweredPermissionPrompt(store),
          coordinator.getPermission(),
        ]);
        if (cancelled || offeredRef.current) return;
        if (shouldOfferPermissionPrompt({ permission, alreadyAnswered, signedIn: true, blocked: false })) {
          offeredRef.current = true;
          setVisible(true);
        }
      })().catch(() => {
        // Best effort: a failed check just means no offer this session.
      });
    }, PERMISSION_PROMPT_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signedIn, blocked]);

  const onConfirm = useCallback(() => {
    setVisible(false);
    const { coordinator, store } = getNotificationRuntime();
    void markPermissionPromptAnswered(store, 'accepted');
    if (userId) {
      // Opens the system dialog, then registers the device token when the user allows it.
      void coordinator.enablePushFromUserAction(userId).catch(() => undefined);
    }
  }, [userId]);

  const onCancel = useCallback(() => {
    setVisible(false);
    void markPermissionPromptAnswered(getNotificationRuntime().store, 'dismissed');
  }, []);

  return (
    <ConfirmDialog
      visible={visible}
      title={PERMISSION_PROMPT_COPY.title}
      message={PERMISSION_PROMPT_COPY.message}
      confirmLabel={PERMISSION_PROMPT_COPY.confirmLabel}
      cancelLabel={PERMISSION_PROMPT_COPY.cancelLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
