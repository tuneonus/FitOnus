import { describe, expect, it } from 'vitest';
import {
  getTimeRangeBuckets,
  getZonedDateParts,
  validateTimezone,
} from '../../../src/modules/progress/domain/calendar-bounds.js';

describe('Calendar Bounds & Timezone Utilities', () => {
  it('validates supported IANA timezones and falls back to UTC for invalid ones', () => {
    expect(validateTimezone('America/New_York')).toBe('America/New_York');
    expect(validateTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(validateTimezone('Europe/London')).toBe('Europe/London');
    expect(validateTimezone('Invalid/Timezone')).toBe('UTC');
    expect(validateTimezone('')).toBe('UTC');
    expect(validateTimezone(undefined)).toBe('UTC');
  });

  it('correctly extracts local date parts across timezones', () => {
    // 2026-10-10 02:00:00 UTC
    // In America/New_York (EDT = UTC-4), this is 2026-10-09 22:00:00
    const testDate = new Date('2026-10-10T02:00:00.000Z');
    const nyParts = getZonedDateParts(testDate, 'America/New_York');

    expect(nyParts.year).toBe(2026);
    expect(nyParts.month).toBe(10);
    expect(nyParts.day).toBe(9);
    expect(nyParts.dateString).toBe('2026-10-09');

    // In Asia/Kolkata (IST = UTC+5:30), this is 2026-10-10 07:30:00
    const istParts = getZonedDateParts(testDate, 'Asia/Kolkata');
    expect(istParts.day).toBe(10);
    expect(istParts.dateString).toBe('2026-10-10');
  });

  it('generates 7 daily buckets for range "D"', () => {
    const fixedNow = new Date('2026-10-09T12:00:00Z');
    const buckets = getTimeRangeBuckets('D', fixedNow, 'UTC');

    expect(buckets.length).toBe(7);
    expect(buckets[6]?.key).toBe('2026-10-09');
    expect(buckets[0]?.key).toBe('2026-10-03');
    for (const b of buckets) {
      expect(b.label).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
      expect(b.startDate.getTime()).toBeLessThan(b.endDate.getTime());
    }
  });

  it('generates 8 weekly buckets for range "W"', () => {
    const fixedNow = new Date('2026-10-09T12:00:00Z');
    const buckets = getTimeRangeBuckets('W', fixedNow, 'UTC');

    expect(buckets.length).toBe(8);
    for (const b of buckets) {
      expect(b.label).toMatch(/^W\d{1,2}$/);
    }
  });

  it('generates 6 monthly buckets for range "M"', () => {
    const fixedNow = new Date('2026-10-09T12:00:00Z');
    const buckets = getTimeRangeBuckets('M', fixedNow, 'UTC');

    expect(buckets.length).toBe(6);
    expect(buckets[5]?.label).toBe('Oct');
    expect(buckets[0]?.label).toBe('May');
  });

  it('generates 3 yearly buckets for range "Y"', () => {
    const fixedNow = new Date('2026-10-09T12:00:00Z');
    const buckets = getTimeRangeBuckets('Y', fixedNow, 'UTC');

    expect(buckets.length).toBe(3);
    expect(buckets[2]?.label).toBe('2026');
    expect(buckets[1]?.label).toBe('2025');
    expect(buckets[0]?.label).toBe('2024');
  });
});
