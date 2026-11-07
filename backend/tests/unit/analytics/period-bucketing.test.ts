import { describe, it, expect } from 'vitest';
import {
  validateTimezone,
  getZonedDateParts,
  formatLocalDate,
  addDaysToDateString,
  generateDateSeries,
  getUtcBoundsForLocalDateRange,
  createCalendarBuckets,
} from '../../../src/modules/analytics/domain/analytics-period.js';

describe('Analytics Period & Calendar Bucketing', () => {
  describe('validateTimezone', () => {
    it('returns valid IANA timezones', () => {
      expect(validateTimezone('America/New_York')).toBe('America/New_York');
      expect(validateTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
      expect(validateTimezone('Europe/London')).toBe('Europe/London');
    });

    it('falls back to UTC for invalid or empty timezones', () => {
      expect(validateTimezone(undefined)).toBe('UTC');
      expect(validateTimezone('')).toBe('UTC');
      expect(validateTimezone('Invalid/Timezone_Name')).toBe('UTC');
    });
  });

  describe('getZonedDateParts and formatLocalDate', () => {
    it('extracts correct local calendar date across positive and negative UTC offsets', () => {
      // 2026-10-10 01:00:00 UTC is still 2026-10-09 in New York (UTC-4)
      const dateUtc = new Date('2026-10-10T01:00:00.000Z');
      const nyParts = getZonedDateParts(dateUtc, 'America/New_York');
      expect(nyParts.dateString).toBe('2026-10-09');
      expect(nyParts.weekday).toBe('Fri');

      // But in Tokyo (UTC+9), it is already 2026-10-10 10:00 AM
      const tokyoParts = getZonedDateParts(dateUtc, 'Asia/Tokyo');
      expect(tokyoParts.dateString).toBe('2026-10-10');
      expect(tokyoParts.weekday).toBe('Sat');
    });

    it('formats local date string correctly', () => {
      const date = new Date('2026-10-05T12:00:00.000Z');
      expect(formatLocalDate(date, 'UTC')).toBe('2026-10-05');
    });
  });

  describe('addDaysToDateString and generateDateSeries', () => {
    it('correctly adds and subtracts days across month and leap year boundaries', () => {
      expect(addDaysToDateString('2026-02-28', 1)).toBe('2026-03-01');
      expect(addDaysToDateString('2026-01-01', -1)).toBe('2025-12-31');
      expect(addDaysToDateString('2026-10-31', 1)).toBe('2026-11-01');
    });

    it('generates an inclusive contiguous date series', () => {
      const series = generateDateSeries('2026-10-01', '2026-10-05');
      expect(series).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    });

    it('returns empty array when start date is after end date', () => {
      expect(generateDateSeries('2026-10-05', '2026-10-01')).toEqual([]);
    });
  });

  describe('getUtcBoundsForLocalDateRange', () => {
    it('generates full-day start and end boundaries', () => {
      const { startUtc, endUtc } = getUtcBoundsForLocalDateRange('2026-10-05', '2026-10-07');
      expect(startUtc.toISOString()).toBe('2026-10-05T00:00:00.000Z');
      expect(endUtc.toISOString()).toBe('2026-10-07T23:59:59.999Z');
    });
  });

  describe('createCalendarBuckets', () => {
    const fixedNow = new Date('2026-10-09T14:30:00.000Z'); // Friday

    it('creates 7 discrete daily buckets for range W', () => {
      const buckets = createCalendarBuckets('W', fixedNow, 'UTC');
      expect(buckets).toHaveLength(7);
      expect(buckets[6]?.key).toBe('2026-10-09');
      expect(buckets[6]?.label).toBe('Fri');
      expect(buckets[0]?.key).toBe('2026-10-03');
      expect(buckets[0]?.label).toBe('Sat');
    });

    it('creates 4 weekly buckets for range M', () => {
      const buckets = createCalendarBuckets('M', fixedNow, 'UTC');
      expect(buckets).toHaveLength(4);
      expect(buckets[3]?.label).toBe('This wk');
      expect(buckets[2]?.label).toBe('W-1');
      expect(buckets[1]?.label).toBe('W-2');
      expect(buckets[0]?.label).toBe('W-3');
      // Total 28 days
      const totalDates = buckets.reduce((sum, b) => sum + b.dateStrings.length, 0);
      expect(totalDates).toBe(28);
    });

    it('creates 12 weekly buckets for range 3M', () => {
      const buckets = createCalendarBuckets('3M', fixedNow, 'UTC');
      expect(buckets).toHaveLength(12);
      expect(buckets[11]?.label).toBe('This wk');
    });

    it('creates 6 monthly buckets for range 6M', () => {
      const buckets = createCalendarBuckets('6M', fixedNow, 'UTC');
      expect(buckets).toHaveLength(6);
      expect(buckets[5]?.label).toBe('Oct');
      expect(buckets[0]?.label).toBe('May');
    });

    it('creates 12 monthly buckets for range Y', () => {
      const buckets = createCalendarBuckets('Y', fixedNow, 'UTC');
      expect(buckets).toHaveLength(12);
      expect(buckets[11]?.label).toBe('Oct');
    });

    it('handles DST transition safely without losing days', () => {
      // In New York, Daylight Saving Time ends on first Sunday in November
      const novNow = new Date('2026-11-05T12:00:00.000Z');
      const buckets = createCalendarBuckets('W', novNow, 'America/New_York');
      expect(buckets).toHaveLength(7);
      // All buckets have valid chronological dates
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i]!.startDate.getTime()).toBeGreaterThan(buckets[i - 1]!.startDate.getTime());
      }
    });
  });
});
