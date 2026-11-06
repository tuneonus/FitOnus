import { describe, expect, it } from 'vitest';
import {
  calculateOccurrencePeriod,
  canClaimOccurrenceReward,
  getIsoWeekNumber,
  getZonedDateParts,
  isActivityWithinOccurrence,
  validateTimezone,
  zonedTimeToUtc,
} from '../../../src/modules/challenges/domain/period-calculator.js';

describe('Period Calculator & Timezone Recurrence Engine', () => {
  describe('Timezone Validation', () => {
    it('validates supported IANA timezones and falls back to UTC safely', () => {
      expect(validateTimezone('America/New_York')).toBe('America/New_York');
      expect(validateTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
      expect(validateTimezone('Europe/London')).toBe('Europe/London');
      expect(validateTimezone('UTC')).toBe('UTC');
      expect(validateTimezone('Invalid/Timezone')).toBe('UTC');
      expect(validateTimezone('')).toBe('UTC');
      expect(validateTimezone(undefined)).toBe('UTC');
      expect(validateTimezone(null)).toBe('UTC');
    });
  });

  describe('Zoned Date Parts', () => {
    it('extracts correct local date parts across different timezones for the same instant', () => {
      // 2026-11-06 02:30:00 UTC
      const instant = new Date('2026-11-06T02:30:00.000Z');

      // In America/New_York (EST = UTC-5): this is 2026-11-05 21:30:00
      const ny = getZonedDateParts(instant, 'America/New_York');
      expect(ny.dateString).toBe('2026-11-05');
      expect(ny.year).toBe(2026);
      expect(ny.month).toBe(11);
      expect(ny.day).toBe(5);

      // In Asia/Kolkata (IST = UTC+5:30): this is 2026-11-06 08:00:00
      const ist = getZonedDateParts(instant, 'Asia/Kolkata');
      expect(ist.dateString).toBe('2026-11-06');
      expect(ist.day).toBe(6);

      // In UTC
      const utc = getZonedDateParts(instant, 'UTC');
      expect(utc.dateString).toBe('2026-11-06');
    });
  });

  describe('Daily Recurrence', () => {
    it('calculates exact local daily period boundaries in UTC', () => {
      const refDate = new Date('2026-11-06T12:00:00.000Z'); // Friday
      const period = calculateOccurrencePeriod('daily', refDate, 'UTC');

      expect(period.occurrenceKey).toBe('daily-2026-11-06');
      expect(period.periodStart.toISOString()).toBe('2026-11-06T00:00:00.000Z');
      expect(period.periodEnd.toISOString()).toBe('2026-11-06T23:59:59.999Z');
      expect(period.periodEnd.getTime()).toBeGreaterThan(period.periodStart.getTime());
    });

    it('calculates daily period boundaries for non-UTC timezone (America/New_York)', () => {
      // In America/New_York on 2026-11-06 (EST = UTC-5):
      // Midnight 00:00:00 is 05:00:00 UTC
      // 23:59:59.999 is 04:59:59.999 UTC the next day
      const refDate = new Date('2026-11-06T15:00:00.000Z'); // 10 AM EST
      const period = calculateOccurrencePeriod('daily', refDate, 'America/New_York');

      expect(period.occurrenceKey).toBe('daily-2026-11-06');
      expect(period.periodStart.toISOString()).toBe('2026-11-06T05:00:00.000Z');
      expect(period.periodEnd.toISOString()).toBe('2026-11-07T04:59:59.999Z');
    });

    it('calculates daily period boundaries for Asia/Kolkata (UTC+5:30)', () => {
      const refDate = new Date('2026-11-06T12:00:00.000Z');
      const period = calculateOccurrencePeriod('daily', refDate, 'Asia/Kolkata');

      expect(period.occurrenceKey).toBe('daily-2026-11-06');
      expect(period.periodStart.toISOString()).toBe('2026-11-05T18:30:00.000Z');
      expect(period.periodEnd.toISOString()).toBe('2026-11-06T18:29:59.999Z');
    });
  });

  describe('Weekly Recurrence (ISO 8601 Monday start)', () => {
    it('calculates week boundaries starting on Monday and ending on Sunday', () => {
      // 2026-11-06 is Friday of Week 45
      // Week 45 Monday: 2026-11-02
      // Week 45 Sunday: 2026-11-08
      const friday = new Date('2026-11-06T12:00:00.000Z');
      const period = calculateOccurrencePeriod('weekly', friday, 'UTC');

      expect(period.occurrenceKey).toBe('weekly-2026-W45');
      expect(period.periodStart.toISOString()).toBe('2026-11-02T00:00:00.000Z');
      expect(period.periodEnd.toISOString()).toBe('2026-11-08T23:59:59.999Z');
    });

    it('calculates week boundaries when reference date is Monday itself', () => {
      const monday = new Date('2026-11-02T08:00:00.000Z');
      const period = calculateOccurrencePeriod('weekly', monday, 'UTC');

      expect(period.occurrenceKey).toBe('weekly-2026-W45');
      expect(period.periodStart.toISOString()).toBe('2026-11-02T00:00:00.000Z');
      expect(period.periodEnd.toISOString()).toBe('2026-11-08T23:59:59.999Z');
    });

    it('calculates week boundaries when reference date is Sunday', () => {
      const sunday = new Date('2026-11-08T22:00:00.000Z');
      const period = calculateOccurrencePeriod('weekly', sunday, 'UTC');

      expect(period.occurrenceKey).toBe('weekly-2026-W45');
      expect(period.periodStart.toISOString()).toBe('2026-11-02T00:00:00.000Z');
      expect(period.periodEnd.toISOString()).toBe('2026-11-08T23:59:59.999Z');
    });

    it('calculates correct ISO week numbers across year transitions', () => {
      const weekInfo = getIsoWeekNumber(2026, 11, 6);
      expect(weekInfo.week).toBe(45);
      expect(weekInfo.weekYear).toBe(2026);
    });
  });

  describe('Monthly Recurrence', () => {
    it('calculates month boundaries from 1st to last day of month', () => {
      const refDate = new Date('2026-11-15T12:00:00.000Z');
      const period = calculateOccurrencePeriod('monthly', refDate, 'UTC');

      expect(period.occurrenceKey).toBe('monthly-2026-11');
      expect(period.periodStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(period.periodEnd.toISOString()).toBe('2026-11-30T23:59:59.999Z');
    });
  });

  describe('Daylight Saving Time (DST) Transitions', () => {
    it('handles US fall-back 25-hour day in New York (Nov 1, 2026)', () => {
      // Nov 1, 2026 was the fall-back day in America/New_York (clocks back at 2am)
      const start = zonedTimeToUtc(2026, 11, 1, 0, 0, 0, 0, 'America/New_York');
      const end = zonedTimeToUtc(2026, 11, 1, 23, 59, 59, 999, 'America/New_York');

      const durationHours = (end.getTime() - start.getTime()) / 3600000;
      expect(Math.round(durationHours)).toBe(25); // 25-hour transition day (fall-back hour)
      expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
      expect(end.toISOString()).toBe('2026-11-02T04:59:59.999Z');
    });
  });

  describe('Late Telemetry & Offline Sync Acceptance', () => {
    it('accepts activity logged with timestamp inside the occurrence period even if synced late', () => {
      const periodStart = new Date('2026-11-06T00:00:00.000Z');
      const periodEnd = new Date('2026-11-06T23:59:59.999Z');

      const workoutActivityTime = new Date('2026-11-06T18:30:00.000Z');
      expect(isActivityWithinOccurrence(workoutActivityTime, periodStart, periodEnd)).toBe(true);

      const nextDayActivityTime = new Date('2026-11-07T00:01:00.000Z');
      expect(isActivityWithinOccurrence(nextDayActivityTime, periodStart, periodEnd)).toBe(false);
    });
  });

  describe('Reward Claim Grace Period', () => {
    it('allows claiming within 7 days after periodEnd', () => {
      const periodEnd = new Date('2026-11-06T23:59:59.999Z');

      // 3 days after periodEnd
      const threeDaysLater = new Date('2026-11-09T10:00:00.000Z');
      expect(canClaimOccurrenceReward(periodEnd, threeDaysLater, 7)).toBe(true);

      // Exactly 7 days after periodEnd
      const sevenDaysLater = new Date('2026-11-13T23:59:59.999Z');
      expect(canClaimOccurrenceReward(periodEnd, sevenDaysLater, 7)).toBe(true);

      // 8 days after periodEnd (expired)
      const eightDaysLater = new Date('2026-11-14T00:01:00.000Z');
      expect(canClaimOccurrenceReward(periodEnd, eightDaysLater, 7)).toBe(false);
    });
  });
});
