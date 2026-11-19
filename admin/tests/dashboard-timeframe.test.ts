import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardApi } from '../src/features/dashboard/api';
import { summarizeTimeframe } from '../src/features/dashboard/utils/timeframe';
import {
  createTimeframeSwitcher,
  type TimeframeSwitcherState,
} from '../src/features/dashboard/utils/timeframe-switcher';
import type { DashboardStats, DashboardTimeframe } from '../src/features/dashboard/types';

const DAYS: Record<DashboardTimeframe, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 };

/** Stats shaped like the backend's answer for `timeframe`: a daily trend exactly that long. */
function statsFor(timeframe: DashboardTimeframe, overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    totalUsers: 200,
    activeUsers: 150,
    disabledUsers: 3,
    activeUsers7d: 40,
    activeUsers30d: 90,
    completedOnboarding: 120,
    pendingOnboarding: 80,
    newRegistrations7d: 9,
    newRegistrations30d: 35,
    recentUsers: [],
    registrationTrend: Array.from({ length: DAYS[timeframe] }, (_, i) => ({
      date: `2026-${String(Math.floor(i / 28) + 6).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      count: 1,
    })),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Admin dashboard timeframe — API requests', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Replaces fetch; answers each URL from `respond` and records what was asked for. */
  function stubFetch(respond: (url: string) => { status?: number; body: unknown }) {
    const urls: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      const { status = 200, body } = respond(url);
      return {
        ok: status < 400,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
      } as unknown as Response;
    }) as typeof fetch;
    return urls;
  }

  it('requests exactly the selected timeframe from the stats endpoint', async () => {
    for (const timeframe of ['7d', '14d', '30d', '90d'] as const) {
      const urls = stubFetch(() => ({ body: { success: true, data: statsFor(timeframe) } }));

      const stats = await dashboardApi.getStats(timeframe);

      assert.equal(urls.length, 1);
      assert.match(urls[0]!, new RegExp(`/dashboard/stats\\?timeframe=${timeframe}$`));
      assert.equal(stats.registrationTrend.length, DAYS[timeframe]);
    }
  });

  it('sends no timeframe when none is given, leaving the backend default', async () => {
    const urls = stubFetch(() => ({ body: { success: true, data: statsFor('14d') } }));

    await dashboardApi.getStats();

    assert.match(urls[0]!, /\/dashboard\/stats$/);
  });

  it('the dashboard load passes the timeframe to the member stats and keeps the other cards independent', async () => {
    const urls = stubFetch((url) =>
      url.includes('/dashboard/stats')
        ? { body: { success: true, data: statsFor('90d') } }
        : { status: 500, body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } } },
    );

    const data = await dashboardApi.getEnhancedDashboard('90d');

    assert.ok(urls.some((u) => /\/dashboard\/stats\?timeframe=90d$/.test(u)));
    assert.equal(data.userStats.registrationTrend.length, 90);
    // The workout, nutrition and challenge cards failed, and say so, without taking the page down.
    assert.equal(data.workoutStats, null);
    assert.equal(data.nutritionStats, null);
    assert.equal(data.challenges, null);
    assert.ok(data.errors.workouts);
    assert.ok(data.errors.nutrition);
    assert.ok(data.errors.challenges);
  });

  it('fails the load (so the error state shows) when the member stats themselves fail', async () => {
    stubFetch(() => ({
      status: 500,
      body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
    }));

    await assert.rejects(dashboardApi.getEnhancedDashboard('30d'));
  });
});

describe('Admin dashboard timeframe — what is shown for each selection', () => {
  it('7D, 14D, 30D and 90D each show their own window with matching labels and totals', () => {
    const seven = summarizeTimeframe(statsFor('7d'), '7d');
    assert.equal(seven.trend.length, 7);
    assert.equal(seven.newRegistrations, 9);
    assert.equal(seven.activeUsers, 40);
    assert.equal(seven.activeWindowLabel, '7D');

    const fourteen = summarizeTimeframe(statsFor('14d'), '14d');
    assert.equal(fourteen.trend.length, 14);
    assert.equal(fourteen.newRegistrations, 14); // sum of 14 daily points of 1
    assert.equal(fourteen.activeWindowLabel, '30D');

    const thirty = summarizeTimeframe(statsFor('30d'), '30d');
    assert.equal(thirty.trend.length, 30);
    assert.equal(thirty.newRegistrations, 35);
    assert.equal(thirty.activeUsers, 90);
    assert.equal(thirty.activeWindowLabel, '30D');
    assert.equal(thirty.activeWindowIsShorter, false);

    const ninety = summarizeTimeframe(statsFor('90d'), '90d');
    assert.equal(ninety.trend.length, 90);
    assert.equal(ninety.newRegistrations, 90); // sum of 90 daily points of 1
    assert.equal(ninety.activeWindowLabel, '30D');
    assert.equal(ninety.activeWindowIsShorter, true);
  });

  it('an empty platform (no registrations, no activity) renders zeros, not NaN or a crash', () => {
    const empty = statsFor('90d', {
      totalUsers: 0,
      activeUsers7d: 0,
      activeUsers30d: 0,
      newRegistrations7d: 0,
      newRegistrations30d: 0,
      registrationTrend: [],
    });

    for (const timeframe of ['7d', '14d', '30d', '90d'] as const) {
      const summary = summarizeTimeframe(empty, timeframe);
      assert.deepEqual(summary.trend, []);
      assert.equal(summary.newRegistrations, 0);
      assert.equal(summary.activeUsers, 0);
    }
  });
});

describe('Admin dashboard timeframe — selecting a timeframe', () => {
  function setup(fetchStats: (timeframe: DashboardTimeframe) => Promise<DashboardStats>) {
    const requested: DashboardTimeframe[] = [];
    const delivered: DashboardTimeframe[] = [];
    const states: TimeframeSwitcherState[] = [];
    const switcher = createTimeframeSwitcher({
      initial: '7d',
      fetchStats: (timeframe) => {
        requested.push(timeframe);
        return fetchStats(timeframe);
      },
      onStats: (_stats, timeframe) => delivered.push(timeframe),
      onState: (state) => states.push(state),
    });
    return { switcher, requested, delivered, states };
  }

  it('refetches from the backend when the timeframe changes, and only then', async () => {
    const { switcher, requested, delivered } = setup(async (tf) => statsFor(tf));

    await switcher.select('7d'); // already selected: nothing to load
    assert.deepEqual(requested, []);

    await switcher.select('30d');
    assert.deepEqual(requested, ['30d']);
    assert.deepEqual(delivered, ['30d']);
    assert.deepEqual(switcher.getState(), { selected: '30d', loaded: '30d', isSwitching: false, error: null });

    await switcher.select('90d');
    assert.deepEqual(requested, ['30d', '90d']);
    assert.equal(switcher.getState().loaded, '90d');
  });

  it('shows the switch as in progress while loading, and keeps the old window on screen until it lands', async () => {
    const pending = deferred<DashboardStats>();
    const { switcher, states } = setup(() => pending.promise);

    const switching = switcher.select('90d');

    assert.deepEqual(switcher.getState(), { selected: '90d', loaded: '7d', isSwitching: true, error: null });
    pending.resolve(statsFor('90d'));
    await switching;
    assert.deepEqual(switcher.getState(), { selected: '90d', loaded: '90d', isSwitching: false, error: null });
    assert.equal(states.length, 2);
  });

  it('ignores a slow answer for a timeframe the admin has already moved on from', async () => {
    const slow30 = deferred<DashboardStats>();
    const { switcher, delivered } = setup((tf) => (tf === '30d' ? slow30.promise : Promise.resolve(statsFor(tf))));

    const first = switcher.select('30d');
    await switcher.select('90d');
    slow30.resolve(statsFor('30d'));
    await first;

    assert.deepEqual(delivered, ['90d']);
    assert.deepEqual(switcher.getState(), { selected: '90d', loaded: '90d', isSwitching: false, error: null });
  });

  it('going back to the timeframe still on screen cancels the pending request', async () => {
    const pending = deferred<DashboardStats>();
    const { switcher, requested, delivered } = setup(() => pending.promise);

    const switching = switcher.select('30d');
    await switcher.select('7d');
    pending.resolve(statsFor('30d'));
    await switching;

    assert.deepEqual(requested, ['30d']); // no second request for 7d
    assert.deepEqual(delivered, []);
    assert.deepEqual(switcher.getState(), { selected: '7d', loaded: '7d', isSwitching: false, error: null });
  });

  it('reverts to the timeframe on screen and reports the error when the request fails', async () => {
    const { switcher, delivered } = setup(async () => {
      throw new Error('Request timed out. Please try again.');
    });

    await switcher.select('90d');

    assert.deepEqual(delivered, []);
    assert.deepEqual(switcher.getState(), {
      selected: '7d',
      loaded: '7d',
      isSwitching: false,
      error: 'Request timed out. Please try again.',
    });
  });

  it('retrying after a failure loads the timeframe and clears the error', async () => {
    let attempt = 0;
    const { switcher } = setup(async (tf) => {
      attempt += 1;
      if (attempt === 1) throw new Error('offline');
      return statsFor(tf);
    });

    await switcher.select('30d');
    assert.equal(switcher.getState().error, 'offline');

    await switcher.select('30d');
    assert.deepEqual(switcher.getState(), { selected: '30d', loaded: '30d', isSwitching: false, error: null });
  });
});
