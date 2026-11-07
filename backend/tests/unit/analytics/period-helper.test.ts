import { describe, it, expect } from 'vitest';
import {
  normalizeAnalyticsRange,
  parseReferenceDate,
} from '../../../src/modules/analytics/application/period-helper.js';

describe('Analytics Period Helper', () => {
  describe('normalizeAnalyticsRange', () => {
    it('returns default range when input is null or undefined', () => {
      expect(normalizeAnalyticsRange(null, 'M')).toBe('M');
      expect(normalizeAnalyticsRange(undefined, 'W')).toBe('W');
    });

    it('normalizes standard uppercase range keys', () => {
      expect(normalizeAnalyticsRange('W')).toBe('W');
      expect(normalizeAnalyticsRange('M')).toBe('M');
      expect(normalizeAnalyticsRange('3M')).toBe('3M');
      expect(normalizeAnalyticsRange('6M')).toBe('6M');
      expect(normalizeAnalyticsRange('Y')).toBe('Y');
      expect(normalizeAnalyticsRange('all')).toBe('all');
    });

    it('normalizes case-insensitive aliases', () => {
      expect(normalizeAnalyticsRange('w')).toBe('W');
      expect(normalizeAnalyticsRange('7d')).toBe('W');
      expect(normalizeAnalyticsRange('week')).toBe('W');

      expect(normalizeAnalyticsRange('m')).toBe('M');
      expect(normalizeAnalyticsRange('30d')).toBe('M');
      expect(normalizeAnalyticsRange('month')).toBe('M');

      expect(normalizeAnalyticsRange('3m')).toBe('3M');
      expect(normalizeAnalyticsRange('90d')).toBe('3M');

      expect(normalizeAnalyticsRange('6m')).toBe('6M');
      expect(normalizeAnalyticsRange('180d')).toBe('6M');

      expect(normalizeAnalyticsRange('y')).toBe('Y');
      expect(normalizeAnalyticsRange('1y')).toBe('Y');
      expect(normalizeAnalyticsRange('year')).toBe('Y');

      expect(normalizeAnalyticsRange('ALL')).toBe('all');
    });

    it('throws validation error for unsupported period strings', () => {
      expect(() => normalizeAnalyticsRange('2W')).toThrowError(/Invalid analytics period/);
      expect(() => normalizeAnalyticsRange('invalid')).toThrowError(/Invalid analytics period/);
      expect(() => normalizeAnalyticsRange('10y')).toThrowError(/Invalid analytics period/);
    });
  });

  describe('parseReferenceDate', () => {
    it('returns current date when reference date is omitted', () => {
      const now = new Date();
      const parsed = parseReferenceDate();
      expect(Math.abs(parsed.getTime() - now.getTime())).toBeLessThan(1000);
    });

    it('parses valid YYYY-MM-DD date string at midday UTC', () => {
      const parsed = parseReferenceDate('2026-10-15');
      expect(parsed.toISOString()).toBe('2026-10-15T12:00:00.000Z');
    });

    it('throws validation error for malformed date formats', () => {
      expect(() => parseReferenceDate('15-10-2026')).toThrowError(/Expected YYYY-MM-DD/);
      expect(() => parseReferenceDate('2026/10/15')).toThrowError(/Expected YYYY-MM-DD/);
      expect(() => parseReferenceDate('not-a-date')).toThrowError(/Expected YYYY-MM-DD/);
    });

    it('throws validation error for out-of-range calendar values', () => {
      expect(() => parseReferenceDate('2026-13-10')).toThrowError(/Invalid calendar date/);
      expect(() => parseReferenceDate('2026-00-10')).toThrowError(/Invalid calendar date/);
      expect(() => parseReferenceDate('2026-10-35')).toThrowError(/Invalid calendar date/);
    });
  });
});
