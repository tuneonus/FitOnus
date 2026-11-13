import type { NotificationEngine } from '../../../services/notificationService';
import { logger } from '../../../utils/logger';
import type {
  NotificationBehaviorLike,
  NotificationEnvironment,
  NotificationsNative,
  ScheduleRequestLike,
} from '../types/push';
import { resolveChannelConfig } from './notification-channels';
import { getNotificationPermission } from './notification-permissions';

/**
 * Adapter that lets the EXISTING `notificationService` run against the real
 * `expo-notifications` module through its own `setNotificationEngine()` seam,
 * without editing that file. It fixes three things the service cannot fix itself:
 *
 *  1. Loading: the service resolves expo-notifications with `eval('require')` by
 *     name, which Metro documents as unsupported in production builds (and the
 *     package is not in the bundle at all). This adapter is built from a normal
 *     static import instead.
 *  2. Channel importance: the service passes 4/3/2 labelled HIGH/DEFAULT/LOW, but
 *     Expo's enum is LOW=4/MIN=3/NONE=2. Known channels use the canonical
 *     definitions in `notification-channels.ts`.
 *  3. Consent: reminders are scheduled only while the OS permission is granted AND a
 *     user is signed in. (The service's own logout path intends "no reminders after
 *     logout"; without the sign-in condition its foreground reconcile would
 *     immediately re-create them for a signed-out device.)
 *
 * It also maps the deprecated `shouldShowAlert` to `shouldShowBanner`/`shouldShowList`.
 */
export type ConsentRefusal = 'permission-not-granted' | 'signed-out';

export type ConsentCheck = { allowed: true } | { allowed: false; reason: ConsentRefusal };

export interface PermissionGate {
  check: () => Promise<ConsentCheck>;
  /** Forget the cached OS permission (call after anything that can change it). */
  invalidate: () => void;
}

export interface PermissionGateOptions {
  /** How long a successful OS permission lookup is reused. A reconcile asks once, not 8 times. */
  ttlMs?: number;
  now?: () => number;
  /** Whether a user is currently signed in. Omit to ignore sign-in state. */
  isSignedIn?: () => boolean;
}

export function createPermissionGate(
  native: NotificationsNative,
  env: NotificationEnvironment,
  options: PermissionGateOptions = {},
): PermissionGate {
  const ttlMs = options.ttlMs ?? 2000;
  const now = options.now ?? Date.now;
  let cached: { granted: boolean; at: number } | null = null;

  return {
    async check() {
      // Sign-in state is evaluated every time (it changes at logout), before the OS lookup.
      if (options.isSignedIn && !options.isSignedIn()) return { allowed: false, reason: 'signed-out' };

      if (!cached || now() - cached.at >= ttlMs) {
        const state = await getNotificationPermission(native, env);
        cached = { granted: state.granted, at: now() };
      }
      return cached.granted ? { allowed: true } : { allowed: false, reason: 'permission-not-granted' };
    },
    invalidate() {
      cached = null;
    },
  };
}

export function normalizeBehavior(behavior: NotificationBehaviorLike): NotificationBehaviorLike {
  const show = behavior.shouldShowBanner ?? behavior.shouldShowAlert ?? true;
  return {
    shouldShowBanner: show,
    shouldShowList: behavior.shouldShowList ?? show,
    shouldPlaySound: behavior.shouldPlaySound ?? false,
    shouldSetBadge: behavior.shouldSetBadge ?? false,
  };
}

const REFUSAL_LOG_INTERVAL_MS = 10_000;

export function createLegacyEngineAdapter(options: {
  native: NotificationsNative;
  gate: PermissionGate;
  now?: () => number;
}): NotificationEngine {
  const { native, gate } = options;
  const now = options.now ?? Date.now;
  let lastRefusalLog = Number.NEGATIVE_INFINITY;

  return {
    setNotificationHandler: (handler) => {
      if (!handler) {
        native.setNotificationHandler(null);
        return;
      }
      native.setNotificationHandler({
        handleNotification: async (notification) =>
          normalizeBehavior(await handler.handleNotification(notification)),
      });
    },
    setNotificationChannelAsync: (channelId, channel) =>
      native.setNotificationChannelAsync(channelId, resolveChannelConfig(channelId, channel)),
    getPermissionsAsync: () => native.getPermissionsAsync(),
    requestPermissionsAsync: async () => {
      try {
        return await native.requestPermissionsAsync();
      } finally {
        gate.invalidate();
      }
    },
    scheduleNotificationAsync: async (request) => {
      const consent = await gate.check();
      if (!consent.allowed) {
        // Resolve quietly with an empty id ("nothing scheduled"). Throwing would make the existing
        // service log a `console.error` per reminder, which pops a LogBox error in dev builds on
        // every launch for a signed-out or not-yet-permitted user.
        const at = now();
        if (at - lastRefusalLog >= REFUSAL_LOG_INTERVAL_MS) {
          lastRefusalLog = at;
          logger.debug(`Reminders are not scheduled (${consent.reason}).`);
        }
        return '';
      }
      return native.scheduleNotificationAsync(request as unknown as ScheduleRequestLike);
    },
    cancelScheduledNotificationAsync: (identifier) => native.cancelScheduledNotificationAsync(identifier),
    cancelAllScheduledNotificationsAsync: () => native.cancelAllScheduledNotificationsAsync(),
    getAllScheduledNotificationsAsync: () => native.getAllScheduledNotificationsAsync(),
  };
}
