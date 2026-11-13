import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  endOfIsoWeek,
  isGoalOverdue,
  isValidCalendarDate,
  localDateString,
  localWeekInstants,
  resolveTimeZone,
  startOfIsoWeek,
  todayInTimeZone,
  zonedDayStart,
} from '../../../src/modules/goals/domain/local-date.js';

const IST = 'Asia/Kolkata';
const NY = 'America/New_York';

describe('goals local-date helpers', () => {
  describe('resolveTimeZone', () => {
    it('keeps valid IANA zones (trimmed) and falls back to UTC for everything else without throwing', () => {
      expect(resolveTimeZone(IST)).toBe(IST);
      expect(resolveTimeZone(`  ${NY} `)).toBe(NY);
      expect(resolveTimeZone('UTC')).toBe('UTC');
      expect(resolveTimeZone(undefined)).toBe('UTC');
      expect(resolveTimeZone(null)).toBe('UTC');
      expect(resolveTimeZone('')).toBe('UTC');
      expect(resolveTimeZone('   ')).toBe('UTC');
      expect(resolveTimeZone('Not/AZone')).toBe('UTC');
      expect(resolveTimeZone('Mars/Olympus_Mons')).toBe('UTC');
      expect(resolveTimeZone('x'.repeat(65))).toBe('UTC');
      expect(resolveTimeZone(42 as unknown as string)).toBe('UTC');
    });
  });

  describe('localDateString', () => {
    it('gives the user a different calendar day than UTC after 18:30Z for IST', () => {
      const instant = new Date('2026-11-12T20:00:00Z');
      expect(localDateString(instant, 'UTC')).toBe('2026-11-12');
      expect(localDateString(instant, IST)).toBe('2026-11-13');
      expect(localDateString(instant, NY)).toBe('2026-11-12');
    });

    it('flips exactly at local midnight (IST midnight is 18:30Z)', () => {
      expect(localDateString(new Date('2026-11-12T18:29:59.999Z'), IST)).toBe('2026-11-12');
      expect(localDateString(new Date('2026-11-12T18:30:00.000Z'), IST)).toBe('2026-11-13');
    });

    it('handles zones ahead of and behind UTC, including 45 minute offsets', () => {
      expect(localDateString(new Date('2026-11-12T12:00:00Z'), 'Pacific/Auckland')).toBe('2026-11-13');
      expect(localDateString(new Date('2026-11-12T18:14:59Z'), 'Asia/Kathmandu')).toBe('2026-11-12');
      expect(localDateString(new Date('2026-11-12T18:15:00Z'), 'Asia/Kathmandu')).toBe('2026-11-13');
      expect(localDateString(new Date('2026-11-13T03:00:00Z'), 'Pacific/Honolulu')).toBe('2026-11-12');
    });

    it('rolls over month, year and leap-day boundaries in local time', () => {
      expect(localDateString(new Date('2026-11-30T18:30:00Z'), IST)).toBe('2026-12-01');
      expect(localDateString(new Date('2026-11-30T18:30:00Z'), 'UTC')).toBe('2026-11-30');
      expect(localDateString(new Date('2026-12-31T19:00:00Z'), IST)).toBe('2027-01-01');
      expect(localDateString(new Date('2026-12-31T19:00:00Z'), 'UTC')).toBe('2026-12-31');
      expect(localDateString(new Date('2027-01-01T03:00:00Z'), NY)).toBe('2026-12-31');
      expect(localDateString(new Date('2028-02-28T18:30:00Z'), IST)).toBe('2028-02-29');
      expect(localDateString(new Date('2028-02-29T18:30:00Z'), IST)).toBe('2028-03-01');
      expect(localDateString(new Date('2027-02-28T18:30:00Z'), IST)).toBe('2027-03-01');
    });

    it('follows daylight saving time (New York)', () => {
      // US clocks jump forward at 07:00Z on 2026-03-08, so the offset changes from -05:00 to -04:00 that day.
      expect(localDateString(new Date('2026-03-08T06:59:00Z'), NY)).toBe('2026-03-08');
      expect(localDateString(new Date('2026-03-09T03:59:00Z'), NY)).toBe('2026-03-08');
      expect(localDateString(new Date('2026-03-09T04:00:00Z'), NY)).toBe('2026-03-09');
      // After the autumn change the offset is -05:00 again: midnight on 2026-11-02 is 05:00Z.
      expect(localDateString(new Date('2026-11-02T04:59:00Z'), NY)).toBe('2026-11-01');
      expect(localDateString(new Date('2026-11-02T05:00:00Z'), NY)).toBe('2026-11-02');
    });

    it('does not depend on the timezone of the machine running the tests', () => {
      const original = process.env.TZ;
      try {
        const results = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati'].map(
          (machineTz) => {
            process.env.TZ = machineTz;
            return [
              localDateString(new Date('2026-11-12T20:00:00Z'), IST),
              localDateString(new Date('2026-11-12T20:00:00Z'), 'UTC'),
              localDateString(new Date('2026-11-15T19:00:00Z'), IST),
            ];
          },
        );
        for (const r of results) expect(r).toEqual(['2026-11-13', '2026-11-12', '2026-11-16']);
      } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
      }
    });

    it('todayInTimeZone reads the injected clock, falling back to UTC for an invalid timezone', () => {
      const clock = () => new Date('2026-11-12T20:00:00Z');
      expect(todayInTimeZone(clock, IST)).toBe('2026-11-13');
      expect(todayInTimeZone(clock, 'UTC')).toBe('2026-11-12');
      expect(todayInTimeZone(clock)).toBe('2026-11-12');
      expect(todayInTimeZone(clock, 'Not/AZone')).toBe('2026-11-12');
    });
  });

  describe('isValidCalendarDate', () => {
    it('accepts real calendar days', () => {
      for (const d of ['2026-11-13', '2026-02-28', '2028-02-29', '1900-01-01', '2100-12-31']) {
        expect(isValidCalendarDate(d), d).toBe(true);
      }
    });

    it('rejects impossible days, malformed strings and years outside the supported range', () => {
      const bad = [
        '2026-02-29',
        '2026-02-30',
        '2026-04-31',
        '2026-13-01',
        '2026-00-10',
        '2026-11-00',
        '0000-01-01',
        '1899-12-31',
        '2101-01-01',
        '2026-1-1',
        '2026-11-13T00:00:00Z',
        '',
      ];
      for (const d of bad) expect(isValidCalendarDate(d), d).toBe(false);
      expect(isValidCalendarDate(20261113)).toBe(false);
      expect(isValidCalendarDate(null)).toBe(false);
    });
  });

  describe('calendar arithmetic', () => {
    it('adds days across month, year and leap boundaries', () => {
      expect(addDaysToDate('2026-11-30', 1)).toBe('2026-12-01');
      expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDaysToDate('2028-02-28', 1)).toBe('2028-02-29');
      expect(addDaysToDate('2027-02-28', 1)).toBe('2027-03-01');
      expect(addDaysToDate('2026-01-01', -1)).toBe('2025-12-31');
      expect(addDaysToDate('2026-11-13', 0)).toBe('2026-11-13');
    });

    it('finds the ISO (Monday-Sunday) week of a date', () => {
      expect(startOfIsoWeek('2026-11-16')).toBe('2026-11-16'); // Monday
      expect(startOfIsoWeek('2026-11-15')).toBe('2026-11-09'); // Sunday belongs to the previous Monday
      expect(startOfIsoWeek('2026-11-12')).toBe('2026-11-09'); // Thursday
      expect(startOfIsoWeek('2027-01-01')).toBe('2026-12-28'); // across the year boundary
      expect(endOfIsoWeek('2026-11-09')).toBe('2026-11-15');
      expect(endOfIsoWeek('2026-11-15')).toBe('2026-11-15');
      expect(endOfIsoWeek('2026-12-28')).toBe('2027-01-03');
    });
  });

  describe('zonedDayStart / localWeekInstants', () => {
    it('returns the instant a local day begins', () => {
      expect(zonedDayStart('2026-11-16', IST).toISOString()).toBe('2026-11-15T18:30:00.000Z');
      expect(zonedDayStart('2026-11-16', 'UTC').toISOString()).toBe('2026-11-16T00:00:00.000Z');
      expect(zonedDayStart('2026-11-13', 'Asia/Kathmandu').toISOString()).toBe('2026-11-12T18:15:00.000Z');
      expect(zonedDayStart('2026-11-16', 'Not/AZone').toISOString()).toBe('2026-11-16T00:00:00.000Z');
    });

    it('is correct on either side of a daylight saving change', () => {
      expect(zonedDayStart('2026-03-08', NY).toISOString()).toBe('2026-03-08T05:00:00.000Z'); // EST
      expect(zonedDayStart('2026-03-09', NY).toISOString()).toBe('2026-03-09T04:00:00.000Z'); // EDT
      expect(zonedDayStart('2026-11-01', NY).toISOString()).toBe('2026-11-01T04:00:00.000Z'); // EDT
      expect(zonedDayStart('2026-11-02', NY).toISOString()).toBe('2026-11-02T05:00:00.000Z'); // EST
    });

    it('builds the user local Monday-Sunday week as a half-open instant range', () => {
      const week = localWeekInstants('2026-11-16', IST);
      expect(week.startDate).toBe('2026-11-16');
      expect(week.endDate).toBe('2026-11-22');
      expect(week.start.toISOString()).toBe('2026-11-15T18:30:00.000Z');
      expect(week.endExclusive.toISOString()).toBe('2026-11-22T18:30:00.000Z');
    });

    it('does not assume a 7 x 24h week when daylight saving changes inside it', () => {
      const week = localWeekInstants('2026-03-08', NY);
      expect(week.startDate).toBe('2026-03-02');
      expect(week.start.toISOString()).toBe('2026-03-02T05:00:00.000Z');
      expect(week.endExclusive.toISOString()).toBe('2026-03-09T04:00:00.000Z');
      expect((week.endExclusive.getTime() - week.start.getTime()) / 3_600_000).toBe(167);
    });
  });

  describe('isGoalOverdue', () => {
    it('is overdue only when active and the target day has passed locally', () => {
      expect(isGoalOverdue({ status: 'active', targetDate: '2026-11-12' }, '2026-11-13')).toBe(true);
      expect(isGoalOverdue({ status: 'active', targetDate: '2026-11-12' }, '2026-11-12')).toBe(false);
      expect(isGoalOverdue({ status: 'active', targetDate: '2026-11-12' }, '2026-11-11')).toBe(false);
      expect(isGoalOverdue({ status: 'active', targetDate: null }, '2026-11-13')).toBe(false);
      expect(isGoalOverdue({ status: 'completed', targetDate: '2026-11-01' }, '2026-11-13')).toBe(false);
      expect(isGoalOverdue({ status: 'paused', targetDate: '2026-11-01' }, '2026-11-13')).toBe(false);
    });
  });
});
