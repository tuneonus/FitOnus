/**
 * Analytics Period Normalization & Validation Helper
 */

import { AppError } from '../../../shared/errors/app-error.js';
import type { TimeRange } from '../domain/analytics-period.js';

const VALID_RANGES = new Set<TimeRange>(['W', 'M', '3M', '6M', 'Y', 'all']);

/**
 * Normalizes user-supplied period or range string to canonical TimeRange.
 * Throws validation AppError if unrecognized.
 */
export function normalizeAnalyticsRange(rawRange?: string | null, defaultRange: TimeRange = 'M'): TimeRange {
  if (!rawRange) {
    return defaultRange;
  }

  const clean = rawRange.trim().toUpperCase();

  if (VALID_RANGES.has(clean as TimeRange)) {
    return clean as TimeRange;
  }

  // Common aliases
  const aliasMap: Record<string, TimeRange> = {
    '7D': 'W',
    WEEK: 'W',
    '30D': 'M',
    MONTH: 'M',
    '90D': '3M',
    '180D': '6M',
    '1Y': 'Y',
    YEAR: 'Y',
    ALL: 'all',
  };

  const resolved = aliasMap[clean];
  if (resolved) {
    return resolved;
  }

  throw new AppError(
    'validation',
    'VALIDATION_FAILED',
    `Invalid analytics period '${rawRange}'. Supported periods: W, M, 3M, 6M, Y, all.`,
  );
}

/**
 * Validates and parses an optional 'YYYY-MM-DD' reference date string.
 * Falls back to current system time if omitted.
 */
export function parseReferenceDate(refDateStr?: string | null): Date {
  if (!refDateStr) {
    return new Date();
  }

  const trimmed = refDateStr.trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(trimmed)) {
    throw new AppError(
      'validation',
      'VALIDATION_FAILED',
      `Invalid reference date '${refDateStr}'. Expected YYYY-MM-DD format.`,
    );
  }

  const [year, month, day] = trimmed.split('-').map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new AppError('validation', 'VALIDATION_FAILED', `Invalid calendar date '${refDateStr}'.`);
  }

  // Midday UTC ensures safety across timezone offsets
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}
