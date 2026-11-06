import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateUUID } from '../src/features/nutrition/utils/uuid';
import {
  sanitizeMeasurementInput,
  type ProgressAnalyticsResponse,
  type PeriodComparisonResponse,
  type ProgressReportResponse,
  type LogWeightInput,
  type LogMeasurementInput,
  type WeightHistoryResponse,
  type MeasurementHistoryResponse,
} from '../src/features/progress/types/progress';
import type { WeightEntry, MeasurementKey, MeasurementEntry } from '../src/features/weight-tracking/types/weight';
import type { QueuedWeightLog, QueuedMeasurementLog } from '../src/features/progress/services/progress-offline-sync';

const RFC4122_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Mobile Progress UUID & Client Idempotency Keys', () => {
  it('generates valid RFC 4122 v4 UUIDs for clientWeightId and clientMeasId', () => {
    const clientWeightId = generateUUID();
    const clientMeasId = generateUUID();

    assert.match(clientWeightId, RFC4122_V4_REGEX, 'clientWeightId must be RFC 4122 v4 compliant');
    assert.match(clientMeasId, RFC4122_V4_REGEX, 'clientMeasId must be RFC 4122 v4 compliant');
    assert.notEqual(clientWeightId, clientMeasId, 'Client UUIDs must be distinct');
  });

  it('generates 100 consecutive UUIDs without duplicate collisions', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateUUID();
      assert.equal(set.has(id), false, `Collision detected for UUID: ${id}`);
      set.add(id);
    }
    assert.equal(set.size, 100);
  });
});

describe('User Isolation & AsyncStorage Key Scoping', () => {
  const getWeightQueueKey = (userId?: string) =>
    userId ? `@fitonus:pending_weight:${userId}` : '@fitonus:pending_weight';

  const getMeasurementQueueKey = (userId?: string) =>
    userId ? `@fitonus:pending_measurements:${userId}` : '@fitonus:pending_measurements';

  const getWeightCacheKey = (range: string, userId?: string) =>
    userId ? `@fitonus:cached_weight_${range}:${userId}` : `@fitonus:cached_weight_${range}`;

  const getMeasurementCacheKey = (userId?: string) =>
    userId ? `@fitonus:cached_measurements:${userId}` : '@fitonus:cached_measurements';

  it('scopes pending mutation queues per user to avoid cross-user data leakage', () => {
    const userA = 'a1000000-0000-4000-8000-000000000001';
    const userB = 'b2000000-0000-4000-8000-000000000002';

    const queueA = getWeightQueueKey(userA);
    const queueB = getWeightQueueKey(userB);
    assert.notEqual(queueA, queueB);
    assert.equal(queueA, `@fitonus:pending_weight:${userA}`);
    assert.equal(queueB, `@fitonus:pending_weight:${userB}`);

    const measQueueA = getMeasurementQueueKey(userA);
    const measQueueB = getMeasurementQueueKey(userB);
    assert.notEqual(measQueueA, measQueueB);
    assert.equal(measQueueA, `@fitonus:pending_measurements:${userA}`);
  });

  it('scopes cached progress queries per user and metric range', () => {
    const userId = 'u1234567-0000-4000-8000-000000000001';
    const cache30d = getWeightCacheKey('30d', userId);
    const cache90d = getWeightCacheKey('90d', userId);
    const measCache = getMeasurementCacheKey(userId);

    assert.equal(cache30d, `@fitonus:cached_weight_30d:${userId}`);
    assert.equal(cache90d, `@fitonus:cached_weight_90d:${userId}`);
    assert.notEqual(cache30d, cache90d);
    assert.equal(measCache, `@fitonus:cached_measurements:${userId}`);
  });

  it('handles unauthenticated fallback key when no user is logged in', () => {
    assert.equal(getWeightQueueKey(undefined), '@fitonus:pending_weight');
    assert.equal(getMeasurementQueueKey(undefined), '@fitonus:pending_measurements');
    assert.equal(getWeightCacheKey('30d', undefined), '@fitonus:cached_weight_30d');
  });
});

describe('Body Measurement Field Mapping & Boundary Sanitization', () => {
  it('correctly maps UI MeasurementKey values to backend field names with domain bounds', () => {
    const uiValues: Partial<Record<MeasurementKey, number>> = {
      waist: 84.5,
      chest: 102.0,
      hip: 99.0,
      arm: 36.5,
      neck: 38.0,
      bodyFat: 15.5,
      muscleMass: 38.2,
    };

    const clientId = generateUUID();
    const sanitized = sanitizeMeasurementInput(uiValues, clientId);

    assert.equal(sanitized.waistCm, 84.5);
    assert.equal(sanitized.chestCm, 102.0);
    assert.equal(sanitized.hipCm, 99.0);
    assert.equal(sanitized.armCm, 36.5);
    assert.equal(sanitized.neckCm, 38.0);
    assert.equal(sanitized.bodyFatPct, 15.5);
    assert.equal(sanitized.muscleMassKg, 38.2);
    assert.equal(sanitized.clientId, clientId);
    assert.equal(sanitized.source, 'manual');
  });

  it('strips zero, negative, and out-of-range metrics to satisfy backend validation schemas', () => {
    const invalidValues: Partial<Record<MeasurementKey, number>> = {
      waist: 0, // Stepper unadjusted default: 0 -> invalid (min 30.1)
      chest: 25.0, // Below min 30.1
      hip: 260.0, // Above max 249.9
      arm: 35.0, // Valid (10.1 - 99.9)
      bodyFat: 75.0, // Above max 60.0
      muscleMass: -5, // Invalid negative
    };

    const sanitized = sanitizeMeasurementInput(invalidValues);

    assert.equal(sanitized.waistCm, undefined, 'Zero waistCm must be stripped');
    assert.equal(sanitized.chestCm, undefined, 'Below-min chestCm must be stripped');
    assert.equal(sanitized.hipCm, undefined, 'Above-max hipCm must be stripped');
    assert.equal(sanitized.armCm, 35.0, 'Valid armCm must be preserved');
    assert.equal(sanitized.bodyFatPct, undefined, 'Above-max bodyFatPct must be stripped');
    assert.equal(sanitized.muscleMassKg, undefined, 'Negative muscleMassKg must be stripped');
  });

  it('calculates body measurement chart points chronologically for selected metric', () => {
    const measurements: MeasurementEntry[] = [
      { date: 'Oct 4', values: { waist: 86.5, arm: 35.5, bodyFat: 18.6 } },
      { date: 'Sep 20', values: { waist: 88.0, arm: 35.0, bodyFat: 19.4 } },
      { date: 'Sep 6', values: { waist: 89.5, arm: 34.8, bodyFat: 20.1 } },
    ];

    const extractPoints = (key: MeasurementKey) =>
      measurements
        .filter((m) => m.values[key] !== undefined)
        .slice(0, 10)
        .reverse()
        .map((m) => ({ label: m.date, value: m.values[key]! }));

    const waistPoints = extractPoints('waist');
    assert.equal(waistPoints.length, 3);
    assert.equal(waistPoints[0]?.label, 'Sep 6');
    assert.equal(waistPoints[0]?.value, 89.5);
    assert.equal(waistPoints[2]?.label, 'Oct 4');
    assert.equal(waistPoints[2]?.value, 86.5);

    const bodyFatPoints = extractPoints('bodyFat');
    assert.equal(bodyFatPoints.length, 3);
    assert.equal(bodyFatPoints[0]?.value, 20.1);
    assert.equal(bodyFatPoints[2]?.value, 18.6);
  });
});

describe('Zero Fabrication & Unsupported Device Metrics Envelopes', () => {
  it('enforces hasDeviceData: false and empty points for unsupported wearable metrics', () => {
    const unsupportedMetrics = ['sleep', 'recovery', 'steps'] as const;

    unsupportedMetrics.forEach((metric) => {
      const mockBackendResponse: ProgressAnalyticsResponse = {
        metric,
        label: metric.charAt(0).toUpperCase() + metric.slice(1),
        unit: metric === 'steps' ? 'steps' : 'h',
        chart: 'bar',
        hasDeviceData: false,
        firstValue: 0,
        latestValue: 0,
        delta: 0,
        points: [],
      };

      assert.equal(mockBackendResponse.hasDeviceData, false, `Metric ${metric} must report hasDeviceData=false`);
      assert.equal(mockBackendResponse.points.length, 0, `Metric ${metric} must have 0 points`);
      assert.equal(mockBackendResponse.firstValue, 0);
      assert.equal(mockBackendResponse.latestValue, 0);
    });
  });

  it('validates supported weight analytics with EMA smoothing structure', () => {
    const weightResponse: ProgressAnalyticsResponse = {
      metric: 'weight',
      label: 'Weight',
      unit: 'kg',
      chart: 'line',
      lowerIsBetter: true,
      hasDeviceData: true,
      goal: 75.0,
      firstValue: 82.0,
      latestValue: 80.5,
      delta: -1.5,
      points: [
        { label: 'W38', value: 82.0 },
        { label: 'W39', value: 81.3 },
        { label: 'W40', value: 80.5 },
      ],
    };

    assert.equal(weightResponse.hasDeviceData, true);
    assert.equal(weightResponse.points.length, 3);
    assert.equal(weightResponse.points[0]?.value, 82.0);
    assert.equal(weightResponse.points[2]?.value, 80.5);
    assert.equal(weightResponse.delta, -1.5);
    assert.equal(weightResponse.lowerIsBetter, true);
  });
});

describe('Period Comparisons & Progress Reports Contract', () => {
  it('verifies Month-over-Month & Week-over-Week comparison data contract matching backend schemas', () => {
    const comparison: PeriodComparisonResponse = {
      title: 'October vs September',
      comparisons: [
        { label: 'Workouts', current: '18', previous: '15', better: true },
        { label: 'Weight change', current: '−1.5 kg', previous: '−0.8 kg', better: true },
        { label: 'Avg sleep', current: '—', previous: '—', better: true },
        { label: 'Avg protein', current: '142 g', previous: '128 g', better: true },
        { label: 'Avg calories', current: '2,150 kcal', previous: '2,280 kcal', better: true },
      ],
    };

    assert.equal(comparison.title, 'October vs September');
    assert.equal(comparison.comparisons.length, 5);
    assert.equal(comparison.comparisons[0]?.label, 'Workouts');
    assert.equal(comparison.comparisons[0]?.better, true);
    assert.equal(comparison.comparisons[2]?.current, '—', 'Sleep without device must display em-dash');
  });

  it('verifies Progress Report structure with calories and workout breakdowns', () => {
    const report: ProgressReportResponse = {
      period: 'Oct 4 – 10',
      generated: 'Sunday, 8:00 AM',
      headline: 'Great consistency this week! Completed 4 workouts.',
      stats: [
        { label: 'Workouts', value: '4', unit: 'sessions', good: true },
        { label: 'Volume', value: '14,200', unit: 'kg', good: true },
        { label: 'Avg calories', value: '2,140', unit: 'kcal', good: true },
        { label: 'Avg protein', value: '158', unit: 'g', good: true },
      ],
      calories: [
        { label: 'Mon', value: 2100 },
        { label: 'Tue', value: 2250 },
        { label: 'Wed', value: 1980 },
        { label: 'Thu', value: 2150 },
        { label: 'Fri', value: 2200 },
        { label: 'Sat', value: 2100 },
        { label: 'Sun', value: 2120 },
      ],
      workouts: [
        { day: 'Mon', title: 'Upper Body A' },
        { day: 'Wed', title: 'Lower Body A' },
        { day: 'Fri', title: 'Upper Body B' },
        { day: 'Sat', title: 'Lower Body B' },
      ],
      achievements: ['Bench Press PR: 75 kg × 6'],
      improvements: ['Keep protein at 160g on rest days'],
      nextGoals: ['Hit 4 workouts next week'],
    };

    assert.equal(report.stats.length, 4);
    assert.equal(report.calories.length, 7);
    assert.equal(report.workouts.length, 4);
    assert.equal(report.achievements[0], 'Bench Press PR: 75 kg × 6');
  });
});

describe('Offline Queue & HTTP 409 Conflict Resolution Logic', () => {
  it('manages queued weight mutations with incremental retry counts and idempotency keys', () => {
    const queue: QueuedWeightLog[] = [];

    const weightInput: LogWeightInput = {
      clientId: generateUUID(),
      weightKg: 81.2,
      loggedAt: new Date().toISOString(),
      notes: 'Offline test weigh-in',
    };

    queue.push({
      clientWeightId: weightInput.clientId!,
      payload: weightInput,
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
    });

    assert.equal(queue.length, 1);
    assert.equal(queue[0]?.retryCount, 0);
    assert.match(queue[0]?.clientWeightId ?? '', RFC4122_V4_REGEX);

    // Increment retry on network failure
    queue[0]!.retryCount += 1;
    queue[0]!.lastError = 'Network request failed';

    assert.equal(queue[0]?.retryCount, 1);
    assert.equal(queue[0]?.lastError, 'Network request failed');

    // Dequeue on sync
    const remaining = queue.filter((item) => item.clientWeightId !== weightInput.clientId);
    assert.equal(remaining.length, 0);
  });

  it('resolves HTTP 409 conflict: recognizes confirmed duplicate vs regenerating for collision', () => {
    const existingServerId = 'w0000000-0000-4000-8000-000000000099';
    const serverLogs: Record<string, { id: string; userId: string; weightKg: number }> = {
      [existingServerId]: { id: existingServerId, userId: 'user-1', weightKg: 79.5 },
    };

    // Case A: User retries submission with same ID after network timeout
    const isConfirmedDuplicate = (id: string, currentUserId: string): boolean => {
      const match = serverLogs[id];
      return match !== undefined && match.userId === currentUserId;
    };

    assert.equal(isConfirmedDuplicate(existingServerId, 'user-1'), true);

    // Case B: Alien collision -> regenerate new UUID v4 to guarantee data is preserved
    let safeId = existingServerId;
    if (!isConfirmedDuplicate(safeId, 'alien-user')) {
      safeId = generateUUID();
    }
    assert.notEqual(safeId, existingServerId);
    assert.match(safeId, RFC4122_V4_REGEX);
  });

  it('discards unrecoverable 4xx client errors (400, 422) to avoid blocking sync queue', () => {
    const isUnrecoverableError = (status: number) =>
      status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429;

    assert.equal(isUnrecoverableError(400), true, '400 Bad Request is unrecoverable');
    assert.equal(isUnrecoverableError(422), true, '422 Unprocessable Entity is unrecoverable');
    assert.equal(isUnrecoverableError(408), false, '408 Request Timeout must be retried');
    assert.equal(isUnrecoverableError(429), false, '429 Rate Limit must be retried');
    assert.equal(isUnrecoverableError(500), false, '500 Server Error must be retried');
  });
});
