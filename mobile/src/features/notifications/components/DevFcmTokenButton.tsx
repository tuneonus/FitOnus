import React, { useCallback, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { showToast } from '@/shared/stores/toastStore';
import { copyDeviceTokenForDev } from '../services/notification-dev-token';
import { getNotificationRuntime } from '../services/notification-runtime';

/**
 * TEMPORARY dev-only control: copies the native FCM token to the clipboard for Firebase console test sends.
 * Renders nothing outside `__DEV__`. The token is never shown, logged or sent anywhere (see notification-dev-token.ts).
 */
export function DevFcmTokenButton(): React.ReactElement | null {
  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    setBusy(true);
    try {
      const { native, env } = getNotificationRuntime();
      const result = await copyDeviceTokenForDev({
        native,
        env,
        isDev: __DEV__,
        // Loaded on demand so a build without the native module still starts; it then fails safely here.
        copyToClipboard: async (text) => {
          const Clipboard = await import('expo-clipboard');
          await Clipboard.setStringAsync(text);
        },
      });
      showToast({ message: result.message });
    } finally {
      setBusy(false);
    }
  }, []);

  if (!__DEV__) return null;

  return (
    <Button fullWidth size="md" variant="outline" loading={busy} onPress={onPress}>
      Copy FCM Token (dev only)
    </Button>
  );
}
