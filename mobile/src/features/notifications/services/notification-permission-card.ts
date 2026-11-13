import type { NotificationPermissionState } from '../types/push';

/**
 * What the Settings → Notifications screen should show when the OS notification
 * permission is not granted. Pure so the copy and the state mapping are testable.
 *
 * The wording is about REMINDERS only. Remote push is not live, and the user is
 * never told it is.
 */
export interface PermissionCardModel {
  title: string;
  body: string;
  actionLabel: string;
  /** 'enable' asks the OS (a user action); 'open-settings' sends the user to system settings. */
  action: 'enable' | 'open-settings';
}

export function getPermissionCardModel(
  permission: NotificationPermissionState | null,
): PermissionCardModel | null {
  // Unknown yet (first read pending), already granted, or not applicable on this platform: show nothing.
  if (!permission || permission.granted || permission.status === 'unsupported') return null;

  if (permission.requiresSystemSettings) {
    return {
      title: 'Notifications are blocked',
      body: 'OnusFit can’t show reminders because notifications are blocked for it in system settings.',
      actionLabel: 'Open settings',
      action: 'open-settings',
    };
  }

  return {
    title: 'Notifications are off',
    body: 'Allow notifications to get your workout and hydration reminders on this device.',
    actionLabel: 'Enable notifications',
    action: 'enable',
  };
}
