import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelCooldownTracker } from '../../../src/shared/ai/model-cooldown-tracker.js';

/**
 * The tracker backs `cooldownStatus` in the admin Gemini usage summary, so its snapshot shape and
 * expiry behavior are part of that admin response.
 */
afterEach(() => vi.useRealTimers());

describe('ModelCooldownTracker', () => {
  it('reports a model as unavailable during its cooldown and available again after reset', () => {
    const tracker = new ModelCooldownTracker();
    tracker.recordFailure('gemini-a', 'RPM', 10);

    expect(tracker.isAvailable('gemini-a')).toBe(false);
    expect(tracker.isAvailable('gemini-b')).toBe(true);

    tracker.reset('gemini-a');
    expect(tracker.isAvailable('gemini-a')).toBe(true);
  });

  it('lets a model recover on its own once the cooldown elapses', () => {
    vi.useFakeTimers();
    const tracker = new ModelCooldownTracker();
    tracker.recordFailure('gemini-a', 'RPM', 30);

    vi.advanceTimersByTime(29_000);
    expect(tracker.isAvailable('gemini-a')).toBe(false);
    expect(tracker.getRemainingCooldownSeconds('gemini-a')).toBe(1);

    vi.advanceTimersByTime(1_000);
    expect(tracker.isAvailable('gemini-a')).toBe(true);
    expect(tracker.getRemainingCooldownSeconds('gemini-a')).toBe(0);
  });

  it('clamps the cooldown to 5 seconds minimum and 24 hours maximum', () => {
    const tracker = new ModelCooldownTracker();
    tracker.recordFailure('short', 'RPM', 0);
    tracker.recordFailure('long', 'RPD', 10_000_000);

    expect(tracker.getRemainingCooldownSeconds('short')).toBe(5);
    expect(tracker.getRemainingCooldownSeconds('long')).toBe(86_400);
  });

  it('counts repeated failures and exposes the admin status snapshot', () => {
    const tracker = new ModelCooldownTracker();
    tracker.recordFailure('gemini-a', 'RPM', 30, 'first');
    tracker.recordFailure('gemini-a', 'RPM', 30, 'second');

    expect(tracker.getStatus()).toEqual([
      { model: 'gemini-a', isCoolingDown: true, remainingSeconds: 30, reason: 'RPM', failureCount: 2 },
    ]);

    tracker.recordSuccess('gemini-a');
    expect(tracker.getStatus()).toEqual([]);
  });
});
