/**
 * Calendar-day helpers for nutrition.
 *
 * Meals, water and analytics are bucketed by the user's LOCAL calendar day. A user in Asia/Kolkata who
 * drinks water at 00:30 on the 13th is on the 13th although it is still the 12th in UTC.
 *
 * Pure and deterministic: nothing reads the machine's timezone or the wall clock (callers inject a `Clock`),
 * and an unknown or malformed timezone never throws, it falls back to UTC.
 *
 * Candidate for promotion to `src/shared/time/` once shared code is open for changes; kept module-local so
 * nutrition does not depend on another module's internals.
 */

export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export const DEFAULT_TIME_ZONE = 'UTC';

/** Calendar years the application accepts. Always inside PostgreSQL's `date` range. */
export const MIN_CALENDAR_YEAR = 1900;
export const MAX_CALENDAR_YEAR = 2100;

const MAX_TIME_ZONE_LENGTH = 64;
const FORMATTER_CACHE_LIMIT = 256;
const DAY_MS = 86_400_000;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;

  let formatter: Intl.DateTimeFormat | null;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    formatter = null;
  }

  // Timezone strings come from request input: keep the cache bounded.
  if (formatterCache.size >= FORMATTER_CACHE_LIMIT) formatterCache.clear();
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Returns a timezone Intl understands, or `UTC` for anything missing, malformed or unknown. Never throws. */
export function resolveTimeZone(candidate?: string | null): string {
  if (typeof candidate !== 'string') return DEFAULT_TIME_ZONE;
  const trimmed = candidate.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TIME_ZONE_LENGTH) return DEFAULT_TIME_ZONE;
  return formatterFor(trimmed) ? trimmed : DEFAULT_TIME_ZONE;
}

/** The calendar date (`YYYY-MM-DD`) an instant falls on in the given timezone. */
export function localDateString(instant: Date, timeZone?: string | null): string {
  const formatter = formatterFor(resolveTimeZone(timeZone)) ?? formatterFor(DEFAULT_TIME_ZONE);
  if (!formatter) throw new Error('The JavaScript runtime does not support the UTC timezone');
  let year = 1970;
  let month = 1;
  let day = 1;
  for (const part of formatter.formatToParts(instant)) {
    const value = Number.parseInt(part.value, 10);
    if (part.type === 'year') year = value;
    else if (part.type === 'month') month = value;
    else if (part.type === 'day') day = value;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "Today" for a user: the calendar date of the injected clock in the user's timezone. */
export function todayInTimeZone(clock: Clock, timeZone?: string | null): string {
  return localDateString(clock(), timeZone);
}

/**
 * True when `value` is `YYYY-MM-DD` and a real calendar day (rejects 2026-02-30, 2026-13-01, 0000-01-01)
 * inside the supported year range. Everything it accepts is safe to hand to PostgreSQL's `date` type.
 */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_CALENDAR_YEAR || year > MAX_CALENDAR_YEAR) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** Calendar arithmetic on a `YYYY-MM-DD` string (timezone independent). */
export function addDaysToDate(dateStr: string, days: number): string {
  const match = CALENDAR_DATE.exec(dateStr);
  if (!match) throw new RangeError(`Invalid calendar date "${dateStr}". Expected YYYY-MM-DD.`);
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const shifted = new Date(base + days * DAY_MS);
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}
