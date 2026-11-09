import type { RouteName } from '../../../app/navigation/routes';

export type NotificationKind =
  | 'workout'
  | 'water'
  | 'streak'
  | 'protein'
  | 'achievement'
  | 'sleep'
  | 'report'
  | 'walking';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  group: 'Today' | 'Yesterday' | 'Earlier';
  read: boolean;
  actionLabel?: string;
  actionRoute?: RouteName;
};

export type NotificationPreference = {
  key: NotificationKind;
  label: string;
  description: string;
  enabled: boolean;
  time?: string | undefined;
};

export interface WaterReminderSettings {
  enabled: boolean;
  intervalHours: number; // default: 2 (1, 2, 3, 4)
  startTime: string; // 24-hour "HH:mm", e.g. "08:00"
  endTime: string; // 24-hour "HH:mm", e.g. "20:00"
}

export interface WorkoutReminderSettings {
  enabled: boolean;
  time: string; // 24-hour "HH:mm", e.g. "07:00"
}

export interface QuietHoursSettings {
  enabled: boolean;
  startTime: string; // 24-hour "HH:mm", e.g. "23:00"
  endTime: string; // 24-hour "HH:mm", e.g. "06:00"
}

export interface NotificationSchedule {
  water: WaterReminderSettings;
  workout: WorkoutReminderSettings;
  quietHours: QuietHoursSettings;
  walking?: { enabled: boolean };
  protein?: { enabled: boolean; time?: string };
  sleep?: { enabled: boolean; time?: string };
  achievement?: { enabled: boolean };
  streak?: { enabled: boolean };
  report?: { enabled: boolean };
  [key: string]: unknown;
}

export const DEFAULT_NOTIFICATION_SCHEDULE: NotificationSchedule = {
  water: {
    enabled: true,
    intervalHours: 2,
    startTime: '08:00',
    endTime: '20:00',
  },
  workout: {
    enabled: true,
    time: '07:00',
  },
  quietHours: {
    enabled: true,
    startTime: '23:00',
    endTime: '06:00',
  },
  walking: { enabled: true },
  protein: { enabled: true, time: '20:00' },
  sleep: { enabled: true, time: '22:30' },
  achievement: { enabled: true },
  streak: { enabled: false },
  report: { enabled: true },
};

/**
 * Convert 12-hour time string ("7:00 AM", "10:30 PM") to 24-hour "HH:mm" ("07:00", "22:30").
 */
export function timeTo24h(time12: string): string {
  if (!time12 || typeof time12 !== 'string') return '07:00';
  const clean = time12.trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(clean)) {
    return clean;
  }
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match || !match[1] || !match[2]) return '07:00';
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();

  if (isNaN(hours) || isNaN(minutes)) return '07:00';
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '07:00';

  if (period === 'PM' && hours < 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Convert 24-hour "HH:mm" ("07:00", "22:30") to 12-hour string ("7:00 AM", "10:30 PM").
 */
export function timeTo12h(time24: string): string {
  if (!time24) return '7:00 AM';
  const match = time24.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !match[1] || !match[2]) return time24;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${period}`;
}

/**
 * Parse "HH:mm" into minutes from start of day (0 .. 1439).
 */
export function timeStringToMinutes(timeStr: string): number {
  const norm = timeTo24h(timeStr);
  const [h, m] = norm.split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Check whether a target time string ("07:00" or "7:00 AM") falls within quiet hours.
 * Supports overnight ranges (e.g. 23:00 to 06:00).
 */
export function isTimeInQuietHours(
  targetTime: string,
  quietHours: { enabled: boolean; startTime: string; endTime: string }
): boolean {
  if (!quietHours.enabled) return false;

  const target = timeStringToMinutes(targetTime);
  const start = timeStringToMinutes(quietHours.startTime);
  const end = timeStringToMinutes(quietHours.endTime);

  if (start === end) {
    return false;
  }

  if (start < end) {
    return target >= start && target < end;
  } else {
    return target >= start || target < end;
  }
}

