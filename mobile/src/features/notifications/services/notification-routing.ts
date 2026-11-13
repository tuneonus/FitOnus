import { isNotificationId } from './notification-inbox-api';
import { routeForRemoteDestination } from './notification-inbox-mapper';
import {
  tabForRoute,
  type RouteName,
  type RouteParams,
  type TabKey,
} from '../../../app/navigation/routes';

/**
 * Notification kinds the app knows how to open. This is a closed allow-list:
 * a payload can only ever select one of these keys. It can never name a route,
 * screen, URL or deep link itself.
 */
export const ROUTABLE_NOTIFICATION_KINDS = [
  'workout',
  'water',
  'goal',
  'streak',
  'protein',
  'achievement',
  'sleep',
  'report',
  'walking',
] as const;

export type RoutableNotificationKind = (typeof ROUTABLE_NOTIFICATION_KINDS)[number];

export interface ParsedNotificationPayload {
  kind: RoutableNotificationKind;
  /** Opaque goal identifier; only present for goal notifications and only if well-formed. */
  goalId?: string;
}

export type NotificationDestination =
  | { type: 'tab'; tab: TabKey }
  | { type: 'screen'; route: RouteName; params?: RouteParams };

const KIND_SET: ReadonlySet<string> = new Set(ROUTABLE_NOTIFICATION_KINDS);
const GOAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Where each kind opens. Hydration has no dedicated screen: the existing water
 * reminders and the hydration summary both live on Home.
 */
const KIND_TO_ROUTE: Readonly<Record<RoutableNotificationKind, RouteName>> = {
  workout: 'workoutPlan',
  water: 'home',
  goal: 'goals',
  streak: 'goals',
  protein: 'nutrition',
  achievement: 'personalRecords',
  sleep: 'sleep',
  report: 'weeklyReport',
  walking: 'activity',
};

/**
 * Validate an untrusted notification `data` object. Returns null for anything
 * that is not a plain object with a known `kind`. Extra keys (including
 * `route`, `url`, `screen`) are ignored on purpose.
 */
export function parseNotificationPayload(data: unknown): ParsedNotificationPayload | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;

  const kind = record.kind;
  if (typeof kind !== 'string' || !KIND_SET.has(kind)) return null;

  const parsed: ParsedNotificationPayload = { kind: kind as RoutableNotificationKind };
  if (kind === 'goal' && typeof record.goalId === 'string' && GOAL_ID_PATTERN.test(record.goalId)) {
    parsed.goalId = record.goalId;
  }
  return parsed;
}

/** Map a validated payload to an existing app destination. */
export function resolveNotificationDestination(payload: ParsedNotificationPayload): NotificationDestination {
  if (payload.kind === 'goal' && payload.goalId) {
    return { type: 'screen', route: 'goalDetail', params: { id: payload.goalId } };
  }

  const route = KIND_TO_ROUTE[payload.kind];
  const tab = tabForRoute(route);
  return tab ? { type: 'tab', tab } : { type: 'screen', route };
}

/**
 * A push sent by the server. Every value arrives as a string (FCM data is string-only).
 * `notificationId` ties it to the inbox row; `destination` is an allow-listed key, never a route.
 */
export interface RemotePushPayload {
  notificationId: string;
  destination: string | null;
  category: string | null;
}

export function parseRemotePushPayload(data: unknown): RemotePushPayload | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (!isNotificationId(record.notificationId)) return null;
  return {
    notificationId: record.notificationId,
    destination: typeof record.destination === 'string' ? record.destination : null,
    category: typeof record.category === 'string' ? record.category : null,
  };
}

function resolveRouteName(route: RouteName): NotificationDestination {
  const tab = tabForRoute(route);
  return tab ? { type: 'tab', tab } : { type: 'screen', route };
}

/**
 * Convenience: untrusted `data` straight to a destination (or null to ignore the tap).
 * Local reminders carry a `kind`; server pushes carry a `notificationId` and an allow-listed `destination` key.
 * Anything else, including a payload that names a `route`, `screen` or `url`, opens nothing.
 */
export function destinationFromNotificationData(data: unknown): NotificationDestination | null {
  const payload = parseNotificationPayload(data);
  if (payload) return resolveNotificationDestination(payload);
  const remote = parseRemotePushPayload(data);
  const route = remote ? routeForRemoteDestination(remote.destination) : null;
  return route ? resolveRouteName(route) : null;
}

/** The slice of the app navigator needed to perform a destination. */
export interface NotificationNavigator {
  navigate: (name: RouteName, params?: RouteParams) => void;
  switchTab: (tab: TabKey) => void;
}

export function performNotificationNavigation(
  navigator: NotificationNavigator,
  destination: NotificationDestination,
): void {
  if (destination.type === 'tab') {
    navigator.switchTab(destination.tab);
  } else {
    navigator.navigate(destination.route, destination.params);
  }
}

/**
 * Holds the most recent notification tap until the app can honor it. A tap can
 * arrive before auth has restored (cold start) or while the user is still in
 * onboarding; navigating then would be overridden or would skip required steps.
 */
export function createPendingNavigation() {
  let pending: NotificationDestination | null = null;
  return {
    /** The latest tap wins. */
    set(destination: NotificationDestination): void {
      pending = destination;
    },
    hasPending(): boolean {
      return pending !== null;
    },
    clear(): void {
      pending = null;
    },
    /** Performs the pending navigation exactly once, and only when `canNavigate` is true. */
    flush(canNavigate: boolean, navigator: NotificationNavigator): boolean {
      if (!pending || !canNavigate) return false;
      const destination = pending;
      pending = null;
      performNotificationNavigation(navigator, destination);
      return true;
    },
  };
}

/** Routes on which a notification tap must wait (auth flow, splash, onboarding). */
export const NAVIGATION_BLOCKED_ROUTES: ReadonlySet<RouteName> = new Set<RouteName>([
  'splash',
  'welcome',
  'login',
  'signup',
  'forgotPassword',
  'resetPassword',
  'authSuccess',
  'authError',
  'onboarding',
]);
