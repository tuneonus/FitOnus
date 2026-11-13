/**
 * Calendar-day helpers for goals and habits.
 *
 * A "day" in this module is the user's LOCAL calendar day, never the UTC day: a user in Asia/Kolkata
 * who completes a habit at 00:30 on the 13th is on the 13th even though it is still the 12th in UTC.
 *
 * Everything here is pure and deterministic:
 *  - nothing reads the machine's timezone (the process TZ only changes how `Date#toString` prints),
 *  - nothing reads the wall clock (callers inject a `Clock`),
 *  - an unknown or malformed timezone never throws, it falls back to UTC.
 *
 * Candidate for promotion to `src/shared/time/` once shared code is open for changes; kept module-local
 * so the goals module does not depend on another module's internals.
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
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
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

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** A formatter for a zone that is known to be valid (see `resolveTimeZone`), UTC otherwise. */
function usableFormatter(timeZone: string): Intl.DateTimeFormat {
  const formatter = formatterFor(timeZone) ?? formatterFor(DEFAULT_TIME_ZONE);
  if (!formatter) throw new Error('The JavaScript runtime does not support the UTC timezone');
  return formatter;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = usableFormatter(timeZone);
  const parts: ZonedParts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const part of formatter.formatToParts(instant)) {
    const value = Number.parseInt(part.value, 10);
    if (part.type === 'year') parts.year = value;
    else if (part.type === 'month') parts.month = value;
    else if (part.type === 'day') parts.day = value;
    else if (part.type === 'hour') parts.hour = value === 24 ? 0 : value;
    else if (part.type === 'minute') parts.minute = value;
    else if (part.type === 'second') parts.second = value;
  }
  return parts;
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The calendar date (`YYYY-MM-DD`) an instant falls on in the given timezone. */
export function localDateString(instant: Date, timeZone?: string | null): string {
  const parts = zonedParts(instant, resolveTimeZone(timeZone));
  return formatDateParts(parts.year, parts.month, parts.day);
}

/** "Today" for a user: the calendar date of the injected clock in the user's timezone. */
export function todayInTimeZone(clock: Clock, timeZone?: string | null): string {
  return localDateString(clock(), timeZone);
}

/** Offset of the timezone from UTC at the given instant, in ms (positive east of UTC). */
function offsetMsAt(utcMs: number, timeZone: string): number {
  const p = zonedParts(new Date(utcMs), timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant at which the given local calendar day begins in the timezone (DST-safe). */
export function zonedDayStart(dateStr: string, timeZone?: string | null): Date {
  const tz = resolveTimeZone(timeZone);
  const { year, month, day } = parseCalendarDate(dateStr);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day);
  const firstGuess = localMidnightAsUtc - offsetMsAt(localMidnightAsUtc, tz);
  // The offset at the guess can differ from the offset at local midnight across a DST change.
  const corrected = localMidnightAsUtc - offsetMsAt(firstGuess, tz);
  return new Date(corrected);
}

function parseCalendarDate(dateStr: string): { year: number; month: number; day: number } {
  const match = CALENDAR_DATE.exec(dateStr);
  if (!match) throw new RangeError(`Invalid calendar date "${dateStr}". Expected YYYY-MM-DD.`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
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
  const { year, month, day } = parseCalendarDate(dateStr);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return formatDateParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(dateStr: string): number {
  const { year, month, day } = parseCalendarDate(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

/** The Monday on or before the given calendar date. */
export function startOfIsoWeek(dateStr: string): string {
  return addDaysToDate(dateStr, 1 - isoWeekday(dateStr));
}

/** The Sunday on or after the given calendar date. */
export function endOfIsoWeek(dateStr: string): string {
  return addDaysToDate(dateStr, 7 - isoWeekday(dateStr));
}

/**
 * The half-open instant range `[start, end)` covering the user's local ISO week (Monday to Sunday) that
 * contains `dateStr`. `end` is the start of the following local Monday, so the range is correct across DST.
 */
export function localWeekInstants(
  dateStr: string,
  timeZone?: string | null,
): { start: Date; endExclusive: Date; startDate: string; endDate: string } {
  const startDate = startOfIsoWeek(dateStr);
  const endDate = endOfIsoWeek(dateStr);
  return {
    start: zonedDayStart(startDate, timeZone),
    endExclusive: zonedDayStart(addDaysToDate(startDate, 7), timeZone),
    startDate,
    endDate,
  };
}

/**
 * A goal is overdue when it is still active, has a target date and that calendar day has already passed
 * for the user (target date strictly before the user's local today).
 */
export function isGoalOverdue(
  goal: { status: string; targetDate: string | null },
  todayLocal: string,
): boolean {
  return goal.status === 'active' && goal.targetDate !== null && goal.targetDate < todayLocal;
}
