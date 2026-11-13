import type { RouteName } from '../../../app/navigation/routes';
import type { AppNotification, NotificationKind } from '../types/notification';
import type { RemoteNotification, ServerCategory } from './notification-inbox-api';

/**
 * Destination keys the server may attach, and the screen each opens. This is the app-side half of the
 * allow-list (the backend validates the same keys): an unknown key opens nothing.
 */
export const REMOTE_DESTINATION_ROUTES: Readonly<Record<string, RouteName>> = {
  home: 'home',
  activity: 'activity',
  coach: 'coach',
  progress: 'progress',
  profile: 'profile',
  workouts: 'workouts',
  nutrition: 'nutrition',
  goals: 'goals',
  challenges: 'challenges',
  badges: 'badges',
  weekly_report: 'weeklyReport',
  notifications: 'notifications',
};

export function routeForRemoteDestination(key: string | null | undefined): RouteName | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(REMOTE_DESTINATION_ROUTES, key) ? REMOTE_DESTINATION_ROUTES[key]! : null;
}

/** Reuses the existing row icons instead of introducing new artwork. */
const CATEGORY_KIND: Readonly<Record<ServerCategory, NotificationKind>> = {
  announcements: 'report',
  challenges: 'achievement',
  coach_insights: 'workout',
  goal_updates: 'streak',
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

export function groupFor(createdAt: Date, now: Date): AppNotification['group'] {
  const days = Math.round((startOfDay(now) - startOfDay(createdAt)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return 'Earlier';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function timeLabel(createdAt: Date, now: Date): string {
  if (groupFor(createdAt, now) === 'Earlier') return `${MONTHS[createdAt.getMonth()]} ${createdAt.getDate()}`;
  const hours = createdAt.getHours();
  const minutes = String(createdAt.getMinutes()).padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export function toAppNotification(remote: RemoteNotification, now: Date = new Date()): AppNotification {
  const createdAt = new Date(remote.createdAt);
  const route = routeForRemoteDestination(remote.destination);
  return {
    id: remote.id,
    kind: CATEGORY_KIND[remote.category],
    title: remote.title,
    body: remote.body,
    time: timeLabel(createdAt, now),
    group: groupFor(createdAt, now),
    read: remote.read,
    remote: true,
    ...(route ? { actionLabel: 'Open', actionRoute: route } : {}),
  };
}
