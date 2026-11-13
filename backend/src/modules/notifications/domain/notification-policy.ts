/**
 * Pure rules for the notification system: which categories exist, where a tap may lead,
 * and how delivery attempts are retried. No I/O, so every rule is unit-testable.
 */

/** Categories a server can send. Users can switch each one off. */
export const SERVER_CATEGORIES = ['announcements', 'challenges', 'coach_insights', 'goal_updates'] as const;
export type ServerCategory = (typeof SERVER_CATEGORIES)[number];

/**
 * Reminders are scheduled on the device. They exist here only so the user's choice follows them to a new
 * phone; the server never sends them, which is what keeps a reminder from arriving twice.
 */
export const LOCAL_CATEGORIES = ['workout_reminders', 'habit_reminders'] as const;
export type LocalCategory = (typeof LOCAL_CATEGORIES)[number];

export const PREFERENCE_CATEGORIES = [...SERVER_CATEGORIES, ...LOCAL_CATEGORIES] as const;
export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

export const isServerCategory = (value: string): value is ServerCategory =>
  (SERVER_CATEGORIES as readonly string[]).includes(value);

/**
 * Closed list of places a notification tap may open. The payload carries one of these keys and the app maps
 * it to a screen; a notification can never name a route, URL or deep link of its own.
 */
export const NOTIFICATION_DESTINATIONS = [
  'home',
  'activity',
  'coach',
  'progress',
  'profile',
  'workouts',
  'nutrition',
  'goals',
  'challenges',
  'badges',
  'weekly_report',
  'notifications',
] as const;
export type NotificationDestination = (typeof NOTIFICATION_DESTINATIONS)[number];

export const AUDIENCE_TYPES = ['all', 'users', 'segment'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'sending',
  'sent',
  'partially_failed',
  'failed',
  'cancelled',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const DELIVERY_STATUSES = [
  'pending',
  'processing',
  'accepted',
  'dry_run',
  'received',
  'failed',
  'invalid_token',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** A delivery that will not be retried any more. */
export const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'accepted',
  'dry_run',
  'received',
  'failed',
  'invalid_token',
];

/** Targeting that depends on existing profile data. Every key is optional; all given keys must match. */
export interface AudienceFilter {
  primaryGoal?: string[];
  experienceLevel?: string[];
  onboardingCompleted?: boolean;
}

export interface Audience {
  type: AudienceType;
  userIds: string[];
  filter: AudienceFilter;
}

/** Selecting a handful of named users needs no extra confirmation; anything broader does. */
export const BULK_USER_THRESHOLD = 25;

export function isBulkAudience(audience: Pick<Audience, 'type' | 'userIds'>): boolean {
  return audience.type !== 'users' || audience.userIds.length > BULK_USER_THRESHOLD;
}

export const MIN_SCHEDULE_LEAD_MS = 30_000;
export const MAX_SCHEDULE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

export interface RetryPolicy {
  /** Total sends per device, the first included. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 30_000,
  maxDelayMs: 15 * 60_000,
};

/** Delay before the next attempt, after `attempts` sends have already been made. A provider hint wins if longer. */
export function nextRetryDelayMs(policy: RetryPolicy, attempts: number, providerHintMs?: number): number {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempts - 1));
  return Math.min(policy.maxDelayMs, Math.max(exponential, providerHintMs ?? 0));
}

export interface DeliveryCounts {
  total: number;
  pending: number;
  processing: number;
  accepted: number;
  dryRun: number;
  received: number;
  failed: number;
  invalidToken: number;
}

/** The status a campaign ends in once nothing is left to send. Never claims delivery from acceptance alone. */
export function finalCampaignStatus(
  counts: DeliveryCounts,
): Extract<CampaignStatus, 'sent' | 'partially_failed' | 'failed'> {
  const problems = counts.failed + counts.invalidToken;
  if (problems === 0) return 'sent';
  const reached = counts.accepted + counts.dryRun + counts.received;
  return reached > 0 ? 'partially_failed' : 'failed';
}

/** Campaigns that may still be edited or cancelled before the dispatcher picks them up. */
export const EDITABLE_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['draft'];
export const CANCELLABLE_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['draft', 'scheduled'];
