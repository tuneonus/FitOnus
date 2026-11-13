import { isTimeInQuietHours, type QuietHoursSettings } from '../types/notification';
import type {
  NotificationEnvironment,
  NotificationsNative,
  ReminderTriggerInput,
} from '../types/push';
import { PUSH_CHANNELS } from './notification-channels';
import { getNotificationPermission } from './notification-permissions';

/**
 * Goal reminders.
 *
 * Workout and hydration reminders already exist in `services/notificationService.ts`
 * and are intentionally NOT reimplemented here. This module adds the one missing
 * reminder type and follows the same conventions (fixed identifier, daily trigger,
 * quiet-hours aware, cancelled on logout via `cancelAllScheduledNotificationsAsync`).
 *
 * Consent model: a goal reminder is scheduled only when ALL of these hold:
 *   1. the master notifications switch is on,
 *   2. `notificationSchedule.goal.enabled === true` (strict; absent means off),
 *   3. the OS notification permission is granted.
 * No UI writes `notificationSchedule.goal` yet, so nothing is scheduled today.
 */
export const GOAL_REMINDER_ID = 'fitonus-reminder-goal';

export const DEFAULT_GOAL_REMINDER_TIME = '18:00';
const DEFAULT_WEEKDAY = 2; // Monday (Sunday = 1)

export type GoalReminderFrequency = 'daily' | 'weekly';

export interface GoalReminderPreference {
  enabled: boolean;
  /** Normalized "HH:mm", or null when the stored value is not a valid time. */
  time: string | null;
  frequency: GoalReminderFrequency;
  weekday: number;
}

export interface SchedulerDeps {
  native: NotificationsNative;
  env: NotificationEnvironment;
}

export type GoalReminderSkipReason =
  | 'master-disabled'
  | 'preference-disabled'
  | 'permission-not-granted'
  | 'in-quiet-hours'
  | 'invalid-time'
  | 'unsupported-platform'
  | 'error';

export type GoalReminderResult =
  | { action: 'scheduled' | 'rescheduled' | 'unchanged' }
  | { action: 'cancelled' | 'skipped'; reason: GoalReminderSkipReason };

/** Accepts "HH:mm" (24h) or "h:mm AM/PM"; returns "HH:mm" or null. */
export function normalizeReminderTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = Number.parseInt(match[1] ?? '', 10);
  const minutes = match[2] ?? '00';
  const period = match[3]?.toUpperCase();

  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

/** Read `notificationSchedule.goal` defensively; anything unexpected means "off". */
export function readGoalReminderPreference(schedule: unknown): GoalReminderPreference {
  const goal =
    schedule && typeof schedule === 'object' ? (schedule as Record<string, unknown>).goal : undefined;
  const record = goal && typeof goal === 'object' ? (goal as Record<string, unknown>) : {};

  const weekday =
    typeof record.weekday === 'number' && Number.isInteger(record.weekday) && record.weekday >= 1 && record.weekday <= 7
      ? record.weekday
      : DEFAULT_WEEKDAY;

  return {
    enabled: record.enabled === true,
    time: record.time === undefined ? DEFAULT_GOAL_REMINDER_TIME : normalizeReminderTime(record.time),
    frequency: record.frequency === 'weekly' ? 'weekly' : 'daily',
    weekday,
  };
}

interface ScheduledGoalData {
  frequency?: unknown;
  weekday?: unknown;
  hour?: unknown;
  minute?: unknown;
  scheduledTz?: unknown;
}

// Serialize operations per native instance so overlapping reconciles (foreground + settings
// change) cannot interleave their read/cancel/schedule steps.
const queues = new WeakMap<object, Promise<unknown>>();
function runExclusive<T>(key: object, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

async function findScheduled(native: NotificationsNative) {
  const all = await native.getAllScheduledNotificationsAsync();
  return all.filter((item) => item.identifier === GOAL_REMINDER_ID);
}

export async function cancelGoalReminder({ native }: Pick<SchedulerDeps, 'native'>): Promise<void> {
  await runExclusive(native, async () => {
    try {
      await native.cancelScheduledNotificationAsync(GOAL_REMINDER_ID);
    } catch {
      // Nothing scheduled (or already cancelled).
    }
  });
}

export interface ReconcileGoalReminderInput {
  masterEnabled: boolean;
  /** The user's `notificationSchedule` record from settings (untrusted shape). */
  schedule: unknown;
  quietHours?: QuietHoursSettings | undefined;
}

/**
 * Bring the scheduled goal reminder in line with the user's settings.
 * Idempotent: an up-to-date reminder is left alone (no cancel/reschedule churn),
 * and a fixed identifier means duplicates are impossible.
 */
export function reconcileGoalReminder(
  deps: SchedulerDeps,
  input: ReconcileGoalReminderInput,
): Promise<GoalReminderResult> {
  const { native, env } = deps;

  return runExclusive(native, async (): Promise<GoalReminderResult> => {
    const cancelExisting = async () => {
      try {
        await native.cancelScheduledNotificationAsync(GOAL_REMINDER_ID);
      } catch {
        // Not scheduled.
      }
    };

    try {
      const preference = readGoalReminderPreference(input.schedule);

      if (!input.masterEnabled) {
        await cancelExisting();
        return { action: 'cancelled', reason: 'master-disabled' };
      }
      if (!preference.enabled) {
        await cancelExisting();
        return { action: 'cancelled', reason: 'preference-disabled' };
      }

      const permission = await getNotificationPermission(native, env);
      if (permission.status === 'unsupported') {
        return { action: 'skipped', reason: 'unsupported-platform' };
      }
      if (!permission.granted) {
        await cancelExisting();
        return { action: 'skipped', reason: 'permission-not-granted' };
      }

      if (preference.time === null) {
        await cancelExisting();
        return { action: 'skipped', reason: 'invalid-time' };
      }
      if (input.quietHours && isTimeInQuietHours(preference.time, input.quietHours)) {
        await cancelExisting();
        return { action: 'skipped', reason: 'in-quiet-hours' };
      }

      const [hourPart = '0', minutePart = '0'] = preference.time.split(':');
      const hour = Number.parseInt(hourPart, 10);
      const minute = Number.parseInt(minutePart, 10);
      const timeZone = env.getTimeZone();

      const existing = await findScheduled(native);
      const upToDate =
        existing.length === 1 &&
        isSameSchedule((existing[0]?.content?.data ?? {}) as ScheduledGoalData, {
          frequency: preference.frequency,
          weekday: preference.weekday,
          hour,
          minute,
          scheduledTz: timeZone,
        });
      if (upToDate) return { action: 'unchanged' };

      if (existing.length > 0) await cancelExisting();

      const trigger: ReminderTriggerInput =
        preference.frequency === 'weekly'
          ? { type: 'weekly', weekday: preference.weekday, hour, minute, channelId: PUSH_CHANNELS.GOAL }
          : { type: 'daily', hour, minute, channelId: PUSH_CHANNELS.GOAL };

      await native.scheduleNotificationAsync({
        identifier: GOAL_REMINDER_ID,
        content: {
          title: 'Goal check-in',
          body: 'A quick look at your goals keeps you on track. Tap to review your progress.',
          data: {
            kind: 'goal',
            frequency: preference.frequency,
            weekday: preference.weekday,
            hour,
            minute,
            // Wall-clock reminders follow the device timezone; recording it lets a later
            // reconcile notice a timezone change and re-arm the trigger.
            scheduledTz: timeZone,
          },
          sound: true,
        },
        trigger,
      });
      return { action: existing.length > 0 ? 'rescheduled' : 'scheduled' };
    } catch {
      return { action: 'skipped', reason: 'error' };
    }
  });
}

function isSameSchedule(
  stored: ScheduledGoalData,
  desired: { frequency: GoalReminderFrequency; weekday: number; hour: number; minute: number; scheduledTz: string },
): boolean {
  return (
    stored.frequency === desired.frequency &&
    stored.hour === desired.hour &&
    stored.minute === desired.minute &&
    stored.scheduledTz === desired.scheduledTz &&
    (desired.frequency === 'daily' || stored.weekday === desired.weekday)
  );
}
