export type TimeRange = 'D' | 'W' | 'M' | 'Y';

export interface TimeBucket {
  key: string;
  label: string;
  startDate: Date;
  endDate: Date;
}

const SUPPORTED_TIMEZONES = new Set<string>();
try {
  for (const tz of Intl.supportedValuesOf('timeZone')) {
    SUPPORTED_TIMEZONES.add(tz);
  }
} catch {
  // Fallback for environments with minimal ICU
  SUPPORTED_TIMEZONES.add('UTC');
}

export function validateTimezone(tz?: string): string {
  if (!tz || typeof tz !== 'string') return 'UTC';
  const clean = tz.trim();
  if (SUPPORTED_TIMEZONES.has(clean)) return clean;
  try {
    // Validate by attempting to construct DateTimeFormat
    new Intl.DateTimeFormat('en-US', { timeZone: clean });
    return clean;
  } catch {
    return 'UTC';
  }
}

/**
 * Returns formatted date parts in the given timezone.
 */
export function getZonedDateParts(
  date: Date,
  timezone: string,
): {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: string; // 'Sun', 'Mon', etc.
  monthShort: string; // 'Jan', 'Feb', etc.
  dateString: string; // 'YYYY-MM-DD'
} {
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
 * Generates discrete calendar buckets for a time range ('D' = 7 days, 'W' = 8 weeks, 'M' = 6 months, 'Y' = 3 years).
 */
export function getTimeRangeBuckets(
  range: TimeRange,
  now: Date = new Date(),
  timezone: string = 'UTC',
): TimeBucket[] {
  const tz = validateTimezone(timezone);
  const buckets: TimeBucket[] = [];

  if (range === 'D') {
    // Last 7 calendar days ending today in local timezone
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const parts = getZonedDateParts(d, tz);
      // Construct UTC boundaries for this local calendar day
      // Start of day in timezone: 00:00:00 local
      const start = new Date(`${parts.dateString}T00:00:00.000Z`);
      const end = new Date(`${parts.dateString}T23:59:59.999Z`);

      buckets.push({
        key: parts.dateString,
        label: parts.weekday,
        startDate: start,
        endDate: end,
      });
    }
  } else if (range === 'W') {
    // Last 8 calendar weeks
    for (let w = 7; w >= 0; w--) {
      const weekStartApprox = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);

      // Label week as W01..W52 (using ISO week representation)
      const weekNum = getIsoWeekNumber(weekStartApprox);
      const start = new Date(weekStartApprox.getTime() - 3 * 24 * 60 * 60 * 1000);
      const end = new Date(weekStartApprox.getTime() + 4 * 24 * 60 * 60 * 1000);

      buckets.push({
        key: `W${weekNum}`,
        label: `W${weekNum}`,
        startDate: start,
        endDate: end,
      });
    }
  } else if (range === 'M') {
    // Last 6 calendar months
    const currentParts = getZonedDateParts(now, tz);
    for (let m = 5; m >= 0; m--) {
      let targetMonth = currentParts.month - m;
      let targetYear = currentParts.year;
      while (targetMonth <= 0) {
        targetMonth += 12;
        targetYear -= 1;
      }

      const monthStr = String(targetMonth).padStart(2, '0');
      const start = new Date(`${targetYear}-${monthStr}-01T00:00:00.000Z`);
      // Last day of month
      const nextMonthFirst = new Date(Date.UTC(targetYear, targetMonth, 1));
      const end = new Date(nextMonthFirst.getTime() - 1);

      const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(start);

      buckets.push({
        key: `${targetYear}-${monthStr}`,
        label: monthName,
        startDate: start,
        endDate: end,
      });
    }
  } else if (range === 'Y') {
    // Last 3 calendar years
    const currentParts = getZonedDateParts(now, tz);
    for (let y = 2; y >= 0; y--) {
      const yr = currentParts.year - y;
      const start = new Date(`${yr}-01-01T00:00:00.000Z`);
      const end = new Date(`${yr}-12-31T23:59:59.999Z`);

      buckets.push({
        key: `${yr}`,
        label: `${yr}`,
        startDate: start,
        endDate: end,
      });
    }
  }

  return buckets;
}

function getIsoWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}
