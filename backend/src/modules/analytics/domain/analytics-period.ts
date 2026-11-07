/**
 * Analytics Period & Calendar Bucketing Utilities
 *
 * Provides deterministic, timezone-aware calendar partitions for analytical series.
 * Handles DST shifts safely using Intl.DateTimeFormat and discrete boundaries.
 */

export type TimeRange = 'W' | 'M' | '3M' | '6M' | 'Y' | 'all';

export interface AnalyticsPeriodBucket {
  key: string;
  label: string;
  startDate: Date;
  endDate: Date;
  dateStrings: string[];
}

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: string; // 'Sun', 'Mon', etc.
  monthShort: string; // 'Jan', 'Feb', etc.
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
 * Validates and normalizes IANA timezone string, falling back to 'UTC'.
 */
export function validateTimezone(tz?: string): string {
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
 * Returns local calendar date parts for a Date in the given timezone.
 */
export function getZonedDateParts(date: Date, timezone: string = 'UTC'): ZonedDateParts {
  const tz = validateTimezone(timezone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const monthShortFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
  });

  const parts = formatter.formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let weekday = 'Sun';

  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    if (p.type === 'month') month = parseInt(p.value, 10);
    if (p.type === 'day') day = parseInt(p.value, 10);
    if (p.type === 'weekday') weekday = p.value;
  }

  const monthShort = monthShortFormatter.format(date);
  const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, weekday, monthShort, dateString };
}

/**
 * Formats a Date as 'YYYY-MM-DD' in the given timezone.
 */
export function formatLocalDate(date: Date, timezone: string = 'UTC'): string {
  return getZonedDateParts(date, timezone).dateString;
}

/**
 * Adds an integer number of days to a YYYY-MM-DD date string.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

/**
 * Generates an inclusive contiguous array of 'YYYY-MM-DD' date strings between start and end.
 */
export function generateDateSeries(startDateStr: string, endDateStr: string): string[] {
  if (startDateStr > endDateStr) return [];
  const series: string[] = [];
  let curr = startDateStr;
  while (curr <= endDateStr) {
    series.push(curr);
    curr = addDaysToDateString(curr, 1);
  }
  return series;
}

/**
 * Converts a pair of local calendar date strings (YYYY-MM-DD) into full-day UTC timestamp boundaries.
 */
export function getUtcBoundsForLocalDateRange(
  startDateStr: string,
  endDateStr: string,
): { startUtc: Date; endUtc: Date } {
  const startUtc = new Date(`${startDateStr}T00:00:00.000Z`);
  const endUtc = new Date(`${endDateStr}T23:59:59.999Z`);
  return { startUtc, endUtc };
}

/**
 * Generates discrete calendar buckets for analytics time ranges.
 * - 'W': Last 7 days ending today, labeled by weekday ('Sun', 'Mon', etc.)
 * - 'M': Last 4 weeks, labeled 'W-3', 'W-2', 'W-1', 'This wk'
 * - '3M': Last 12 weeks, labeled by week start date
 * - '6M': Last 6 calendar months, labeled by short month name ('May', 'Jun', etc.)
 * - 'Y': Last 12 calendar months, labeled by short month name
 * - 'all': Defaults to last 12 months if no custom bounds provided
 */
export function createCalendarBuckets(
  range: TimeRange,
  now: Date = new Date(),
  timezone: string = 'UTC',
): AnalyticsPeriodBucket[] {
  const tz = validateTimezone(timezone);
  const todayParts = getZonedDateParts(now, tz);
  const todayStr = todayParts.dateString;
  const buckets: AnalyticsPeriodBucket[] = [];

  if (range === 'W') {
    // 7 discrete calendar days ending today
    for (let i = 6; i >= 0; i--) {
      const dateStr = addDaysToDateString(todayStr, -i);
      const [y, m, d] = dateStr.split('-').map(Number);
      const refDate = new Date(Date.UTC(y!, m! - 1, d, 12, 0, 0));
      const parts = getZonedDateParts(refDate, tz);
      const { startUtc, endUtc } = getUtcBoundsForLocalDateRange(dateStr, dateStr);

      buckets.push({
        key: dateStr,
        label: parts.weekday,
        startDate: startUtc,
        endDate: endUtc,
        dateStrings: [dateStr],
      });
    }
    return buckets;
  }

  if (range === 'M') {
    // 4 discrete 7-day weeks ending today (total 28 days)
    for (let w = 3; w >= 0; w--) {
      const endOffset = w * 7;
      const startOffset = endOffset + 6;
      const startStr = addDaysToDateString(todayStr, -startOffset);
      const endStr = addDaysToDateString(todayStr, -endOffset);
      const label = w === 0 ? 'This wk' : `W-${w}`;
      const dates = generateDateSeries(startStr, endStr);
      const { startUtc, endUtc } = getUtcBoundsForLocalDateRange(startStr, endStr);

      buckets.push({
        key: `week-${w}`,
        label,
        startDate: startUtc,
        endDate: endUtc,
        dateStrings: dates,
      });
    }
    return buckets;
  }

  if (range === '3M') {
    // 12 discrete 7-day weeks (84 days)
    for (let w = 11; w >= 0; w--) {
      const endOffset = w * 7;
      const startOffset = endOffset + 6;
      const startStr = addDaysToDateString(todayStr, -startOffset);
      const endStr = addDaysToDateString(todayStr, -endOffset);
      const [y, m, d] = startStr.split('-').map(Number);
      const refDate = new Date(Date.UTC(y!, m! - 1, d, 12, 0, 0));
      const parts = getZonedDateParts(refDate, tz);
      const label = `${parts.monthShort} ${parts.day}`;
      const dates = generateDateSeries(startStr, endStr);
      const { startUtc, endUtc } = getUtcBoundsForLocalDateRange(startStr, endStr);

      buckets.push({
        key: `w-${w}`,
        label: w === 0 ? 'This wk' : label,
        startDate: startUtc,
        endDate: endUtc,
        dateStrings: dates,
      });
    }
    return buckets;
  }

  if (range === '6M' || range === 'Y' || range === 'all') {
    const monthCount = range === '6M' ? 6 : 12;
    for (let i = monthCount - 1; i >= 0; i--) {
      // Step back month by month
      let targetYear = todayParts.year;
      let targetMonth = todayParts.month - i;
      while (targetMonth < 1) {
        targetMonth += 12;
        targetYear -= 1;
      }

      const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      // Find last day of target month
      const nextMonthFirst = new Date(Date.UTC(targetYear, targetMonth, 1));
      const lastDayDate = new Date(nextMonthFirst.getTime() - 24 * 60 * 60 * 1000);
      const endStr = lastDayDate.toISOString().slice(0, 10);

      const refDate = new Date(Date.UTC(targetYear, targetMonth - 1, 15, 12, 0, 0));
      const parts = getZonedDateParts(refDate, tz);
      const dates = generateDateSeries(startStr, endStr);
      const { startUtc, endUtc } = getUtcBoundsForLocalDateRange(startStr, endStr);

      buckets.push({
        key: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
        label: parts.monthShort,
        startDate: startUtc,
        endDate: endUtc,
        dateStrings: dates,
      });
    }
    return buckets;
  }

  return buckets;
}
