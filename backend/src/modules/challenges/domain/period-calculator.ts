import type { ChallengeCadence } from './challenge.js';

export interface OccurrencePeriodResult {
  periodStart: Date;
  periodEnd: Date;
  occurrenceKey: string;
}

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekdayIso: number; // 1 (Mon) to 7 (Sun)
  dateString: string; // 'YYYY-MM-DD'
}

const SUPPORTED_TIMEZONES = new Set<string>();
try {
  for (const tz of Intl.supportedValuesOf('timeZone')) {
    SUPPORTED_TIMEZONES.add(tz);
  }
} catch {
  SUPPORTED_TIMEZONES.add('UTC');
}

/**
 * Validates an IANA timezone identifier; falls back safely to 'UTC'.
 */
export function validateTimezone(tz?: string | null): string {
  if (!tz || typeof tz !== 'string') return 'UTC';
  const clean = tz.trim();
  if (SUPPORTED_TIMEZONES.has(clean)) return clean;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: clean });
    return clean;
  } catch {
    return 'UTC';
  }
}

/**
 * Extracts calendar date parts in user's specified local timezone.
 */
export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const tz = validateTimezone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let weekdayStr = 'Mon';

  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    if (p.type === 'month') month = parseInt(p.value, 10);
    if (p.type === 'day') day = parseInt(p.value, 10);
    if (p.type === 'weekday') weekdayStr = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const weekdayIso = weekdayMap[weekdayStr] || 1;
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, weekdayIso, dateString };
}

/**
 * Converts a specific local date/time in an IANA timezone into an exact UTC Date,
 * taking into account local timezone offsets and Daylight Saving Time (DST).
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
  timeZone = 'UTC',
): Date {
  const tz = validateTimezone(timeZone);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(naiveUtc));
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;

  let localHour = parseInt(p.hour || '0', 10);
  if (localHour === 24) localHour = 0;

  const localAsUtc = Date.UTC(
    parseInt(p.year || '1970', 10),
    parseInt(p.month || '1', 10) - 1,
    parseInt(p.day || '1', 10),
    localHour,
    parseInt(p.minute || '0', 10),
    parseInt(p.second || '0', 10),
    ms,
  );

  const offset = localAsUtc - naiveUtc;
  return new Date(naiveUtc - offset);
}

/**
 * Calculates the ISO 8601 week number for a calendar date (Thursday-based).
 */
export function getIsoWeekNumber(
  year: number,
  month: number,
  day: number,
): { week: number; weekYear: number } {
  const target = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Nearest Thursday
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  const weekYear = new Date(firstThursday).getUTCFullYear();
  return { week: weekNumber, weekYear };
}

/**
 * Calculates unambiguous occurrence start/end boundaries and deterministic occurrence key
 * for a recurring challenge based on cadence and user timezone.
 */
export function calculateOccurrencePeriod(
  cadence: ChallengeCadence,
  referenceDate: Date = new Date(),
  timeZone = 'UTC',
): OccurrencePeriodResult {
  const tz = validateTimezone(timeZone);
  const local = getZonedDateParts(referenceDate, tz);

  if (cadence === 'daily') {
    const periodStart = zonedTimeToUtc(local.year, local.month, local.day, 0, 0, 0, 0, tz);
    const periodEnd = zonedTimeToUtc(local.year, local.month, local.day, 23, 59, 59, 999, tz);
    const occurrenceKey = `daily-${local.dateString}`;
    return { periodStart, periodEnd, occurrenceKey };
  }

  if (cadence === 'weekly') {
    // ISO 8601 week: Monday (1) to Sunday (7)
    const daysSinceMonday = local.weekdayIso - 1;
    // Calculate Monday local date
    const mondayNaive = new Date(Date.UTC(local.year, local.month - 1, local.day - daysSinceMonday));
    const monYear = mondayNaive.getUTCFullYear();
    const monMonth = mondayNaive.getUTCMonth() + 1;
    const monDay = mondayNaive.getUTCDate();

    // Calculate Sunday local date (Monday + 6 days)
    const sundayNaive = new Date(Date.UTC(monYear, monMonth - 1, monDay + 6));
    const sunYear = sundayNaive.getUTCFullYear();
    const sunMonth = sundayNaive.getUTCMonth() + 1;
    const sunDay = sundayNaive.getUTCDate();

    const periodStart = zonedTimeToUtc(monYear, monMonth, monDay, 0, 0, 0, 0, tz);
    const periodEnd = zonedTimeToUtc(sunYear, sunMonth, sunDay, 23, 59, 59, 999, tz);

    const { week, weekYear } = getIsoWeekNumber(local.year, local.month, local.day);
    const occurrenceKey = `weekly-${weekYear}-W${String(week).padStart(2, '0')}`;
    return { periodStart, periodEnd, occurrenceKey };
  }

  if (cadence === 'monthly') {
    // 1st of month to last day of month
    const startYear = local.year;
    const startMonth = local.month;
    const lastDay = new Date(Date.UTC(startYear, startMonth, 0)).getUTCDate();

    const periodStart = zonedTimeToUtc(startYear, startMonth, 1, 0, 0, 0, 0, tz);
    const periodEnd = zonedTimeToUtc(startYear, startMonth, lastDay, 23, 59, 59, 999, tz);
    const occurrenceKey = `monthly-${startYear}-${String(startMonth).padStart(2, '0')}`;
    return { periodStart, periodEnd, occurrenceKey };
  }

  // special / custom defaults to 30 days starting from reference date
  const periodStart = referenceDate;
  const periodEnd = new Date(referenceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const occurrenceKey = `custom-${local.dateString}`;
  return { periodStart, periodEnd, occurrenceKey };
}

/**
 * Checks whether an activity timestamp falls within an occurrence's period.
 * Supports late/offline synced telemetry whose actual timestamp was within the period.
 */
export function isActivityWithinOccurrence(activityDate: Date, periodStart: Date, periodEnd: Date): boolean {
  const time = activityDate.getTime();
  return time >= periodStart.getTime() && time <= periodEnd.getTime();
}

/**
 * Checks if a reward can still be claimed for an occurrence given a grace period.
 * Default grace period is 7 days after periodEnd.
 */
export function canClaimOccurrenceReward(
  periodEnd: Date,
  checkDate: Date = new Date(),
  graceDays = 7,
): boolean {
  const graceMs = Math.max(0, graceDays) * 24 * 60 * 60 * 1000;
  const deadline = periodEnd.getTime() + graceMs;
  return checkDate.getTime() <= deadline;
}
