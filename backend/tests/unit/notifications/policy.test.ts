import { describe, expect, it } from 'vitest';
import { normalizeAudience } from '../../../src/modules/notifications/domain/audience.js';
import {
  DEFAULT_RETRY_POLICY,
  finalCampaignStatus,
  isBulkAudience,
  LOCAL_CATEGORIES,
  NOTIFICATION_DESTINATIONS,
  nextRetryDelayMs,
  SERVER_CATEGORIES,
  type DeliveryCounts,
} from '../../../src/modules/notifications/domain/notification-policy.js';

const counts = (overrides: Partial<DeliveryCounts> = {}): DeliveryCounts => ({
  total: 0,
  pending: 0,
  processing: 0,
  accepted: 0,
  dryRun: 0,
  received: 0,
  failed: 0,
  invalidToken: 0,
  ...overrides,
});

describe('categories and destinations', () => {
  it('never lets the server send the categories the device schedules locally', () => {
    // A reminder arriving from both the phone and the server would fire twice.
    for (const local of LOCAL_CATEGORIES) expect(SERVER_CATEGORIES as readonly string[]).not.toContain(local);
  });

  it('only allows plain screen keys as tap destinations (no routes, URLs or deep links)', () => {
    for (const key of NOTIFICATION_DESTINATIONS) expect(key).toMatch(/^[a-z_]+$/);
  });
});

describe('normalizeAudience', () => {
  const id = '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01';

  it('drops stray fields from an "all" audience', () => {
    expect(normalizeAudience({ type: 'all', userIds: [id], filter: { onboardingCompleted: true } })).toEqual({
      type: 'all',
      userIds: [],
      filter: {},
    });
  });

  it('de-duplicates and lower-cases selected users', () => {
    const audience = normalizeAudience({ type: 'users', userIds: [id, id.toUpperCase()] });
    expect(audience.userIds).toEqual([id]);
  });

  it('rejects an empty user selection', () => {
    expect(() => normalizeAudience({ type: 'users', userIds: [] })).toThrow(/audience is invalid/);
  });

  it('rejects more than 1000 selected users', () => {
    const many = Array.from(
      { length: 1001 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(() => normalizeAudience({ type: 'users', userIds: many })).toThrow();
  });

  it('refuses an empty segment so it cannot silently mean "everyone"', () => {
    expect(() => normalizeAudience({ type: 'segment', filter: {} })).toThrow();
    expect(() => normalizeAudience({ type: 'segment', filter: { primaryGoal: [] } })).toThrow();
  });

  it('keeps only the filters that were set', () => {
    expect(
      normalizeAudience({
        type: 'segment',
        filter: { primaryGoal: ['lose', 'lose'], onboardingCompleted: false },
      }),
    ).toEqual({
      type: 'segment',
      userIds: [],
      filter: { primaryGoal: ['lose'], onboardingCompleted: false },
    });
  });
});

describe('isBulkAudience', () => {
  it('treats everyone and segments as bulk', () => {
    expect(isBulkAudience({ type: 'all', userIds: [] })).toBe(true);
    expect(isBulkAudience({ type: 'segment', userIds: [] })).toBe(true);
  });

  it('treats a short hand-picked list as not bulk, a long one as bulk', () => {
    expect(isBulkAudience({ type: 'users', userIds: ['a', 'b'] })).toBe(false);
    expect(isBulkAudience({ type: 'users', userIds: Array.from({ length: 26 }, (_, i) => String(i)) })).toBe(
      true,
    );
  });
});

describe('nextRetryDelayMs', () => {
  const policy = DEFAULT_RETRY_POLICY;

  it('backs off exponentially from the base delay', () => {
    expect(nextRetryDelayMs(policy, 1)).toBe(30_000);
    expect(nextRetryDelayMs(policy, 2)).toBe(60_000);
    expect(nextRetryDelayMs(policy, 3)).toBe(120_000);
  });

  it('is capped', () => {
    expect(nextRetryDelayMs(policy, 20)).toBe(policy.maxDelayMs);
  });

  it('honours a longer provider hint but never exceeds the cap', () => {
    expect(nextRetryDelayMs(policy, 1, 90_000)).toBe(90_000);
    expect(nextRetryDelayMs(policy, 1, 10_000)).toBe(30_000);
    expect(nextRetryDelayMs(policy, 1, 99 * 60_000)).toBe(policy.maxDelayMs);
  });
});

describe('finalCampaignStatus', () => {
  it('is "sent" when nothing failed (including a campaign with no devices at all)', () => {
    expect(finalCampaignStatus(counts())).toBe('sent');
    expect(finalCampaignStatus(counts({ total: 3, accepted: 3 }))).toBe('sent');
  });

  it('is "partially_failed" when some reached the provider and some did not', () => {
    expect(finalCampaignStatus(counts({ total: 3, accepted: 2, failed: 1 }))).toBe('partially_failed');
    expect(finalCampaignStatus(counts({ total: 3, received: 1, invalidToken: 2 }))).toBe('partially_failed');
  });

  it('is "failed" when nothing got through', () => {
    expect(finalCampaignStatus(counts({ total: 2, failed: 1, invalidToken: 1 }))).toBe('failed');
  });
});
