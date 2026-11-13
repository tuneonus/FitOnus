import { describe, expect, it, vi } from 'vitest';
import type {
  CampaignRecord,
  DeliveryJob,
  DeliveryOutcome,
  DispatchRepository,
  PushMessage,
  PushSender,
  PushSendResult,
} from '../../../src/modules/notifications/application/ports.js';
import {
  DEFAULT_DISPATCHER_OPTIONS,
  NotificationDispatcher,
} from '../../../src/modules/notifications/application/services/notification-dispatcher.js';
import {
  DEFAULT_RETRY_POLICY,
  type DeliveryCounts,
  type DeliveryStatus,
} from '../../../src/modules/notifications/domain/notification-policy.js';

const campaign = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: 'c1',
  title: 'Hi',
  body: 'There',
  category: 'announcements',
  destination: 'home',
  audience: { type: 'all', userIds: [], filter: {} },
  createdBy: null,
  status: 'sending',
  scheduledAt: new Date(),
  startedAt: new Date(),
  fannedOutAt: null,
  completedAt: null,
  cancelledAt: null,
  targetCount: 0,
  skippedCount: 0,
  lastError: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

interface FakeDelivery {
  job: DeliveryJob;
  status: DeliveryStatus;
  errorCode: string | null;
  retryDelayMs: number | null;
}

/** In-memory DispatchRepository that models just the state transitions the dispatcher relies on. */
class FakeRepo implements DispatchRepository {
  deliveries: FakeDelivery[] = [];
  invalidated: { deviceId: string; reason: string }[] = [];
  finished: { id: string; status: string; error: string | null }[] = [];
  released: string[] = [];
  fanOuts = 0;
  campaigns: CampaignRecord[] = [];

  addDelivery(id: string, token: string | null = `token-${id}`): void {
    this.deliveries.push({
      status: 'pending',
      errorCode: null,
      retryDelayMs: null,
      job: {
        id,
        notificationId: `n-${id}`,
        campaignId: 'c1',
        attempts: 0,
        token,
        deviceId: `d-${id}`,
        title: 'Hi',
        body: 'There',
        category: 'announcements',
        destination: 'home',
      },
    });
  }

  claimDueCampaigns = vi.fn(async () => this.campaigns);
  fanOut = vi.fn(async () => {
    this.fanOuts += 1;
    return { targetCount: 0, skippedCount: 0, notificationCount: 0, deliveryCount: 0 };
  });

  async claimDeliveries(_id: string, limit: number): Promise<DeliveryJob[]> {
    const due = this.deliveries
      .filter((d) => d.status === 'pending' && d.retryDelayMs === null)
      .slice(0, limit);
    for (const d of due) {
      d.status = 'processing';
      d.job = { ...d.job, attempts: d.job.attempts + 1 };
    }
    return due.map((d) => d.job);
  }

  async recordOutcome(id: string, outcome: DeliveryOutcome): Promise<void> {
    const d = this.deliveries.find((x) => x.job.id === id)!;
    if (outcome.kind === 'accepted') d.status = outcome.dryRun ? 'dry_run' : 'accepted';
    else if (outcome.kind === 'retry') {
      d.status = 'pending';
      d.errorCode = outcome.errorCode;
      d.retryDelayMs = outcome.delayMs; // stays unclaimable: the back-off has not elapsed
    } else {
      d.status = outcome.kind === 'failed' ? 'failed' : 'invalid_token';
      d.errorCode = outcome.errorCode;
    }
  }

  async invalidateDevice(deviceId: string, reason: string): Promise<void> {
    this.invalidated.push({ deviceId, reason });
  }

  async deliveryCounts(): Promise<DeliveryCounts> {
    const count = (s: DeliveryStatus) => this.deliveries.filter((d) => d.status === s).length;
    return {
      total: this.deliveries.length,
      pending: count('pending'),
      processing: count('processing'),
      accepted: count('accepted'),
      dryRun: count('dry_run'),
      received: count('received'),
      failed: count('failed'),
      invalidToken: count('invalid_token'),
    };
  }

  async finish(id: string, status: string, error: string | null): Promise<void> {
    this.finished.push({ id, status, error });
  }

  async releaseLease(id: string): Promise<void> {
    this.released.push(id);
  }
}

class ScriptedSender implements PushSender {
  sent: PushMessage[] = [];
  constructor(
    private readonly script: (message: PushMessage, call: number) => PushSendResult,
    readonly dryRun = false,
  ) {}
  async send(message: PushMessage): Promise<PushSendResult> {
    this.sent.push(message);
    return this.script(message, this.sent.length);
  }
}

const accepted: PushSendResult = { kind: 'accepted', messageId: 'm' };

const make = (
  repo: FakeRepo,
  sender: PushSender,
  overrides: Partial<typeof DEFAULT_DISPATCHER_OPTIONS> = {},
) =>
  new NotificationDispatcher(
    { repo, sender },
    { ...DEFAULT_DISPATCHER_OPTIONS, retry: DEFAULT_RETRY_POLICY, ...overrides },
  );

describe('NotificationDispatcher', () => {
  it('fans a campaign out once, sends each delivery once and finishes as "sent"', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign()];
    ['a', 'b', 'c'].forEach((id) => repo.addDelivery(id));
    const sender = new ScriptedSender(() => accepted);

    const summary = await make(repo, sender).runOnce();

    expect(repo.fanOuts).toBe(1);
    expect(sender.sent).toHaveLength(3);
    expect(summary).toMatchObject({ campaigns: 1, attempted: 3, accepted: 3 });
    expect(repo.finished).toEqual([{ id: 'c1', status: 'sent', error: null }]);
  });

  it('skips fan-out when the campaign was already fanned out (resume after a crash)', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    await make(repo, new ScriptedSender(() => accepted)).runOnce();
    expect(repo.fanOuts).toBe(0);
  });

  it('puts only opaque ids, the category and a destination key in the push data', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign()];
    repo.addDelivery('a');
    const sender = new ScriptedSender(() => accepted);
    await make(repo, sender).runOnce();
    expect(sender.sent[0]!.data).toEqual({
      notificationId: 'n-a',
      category: 'announcements',
      destination: 'home',
    });
    expect(sender.sent[0]!.channelId).toBe('remote-updates');
  });

  it('schedules a retry with back-off and keeps the campaign open while a delivery is waiting', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    const sender = new ScriptedSender(() => ({ kind: 'retryable', code: 'UNAVAILABLE' }));

    await make(repo, sender).runOnce();

    expect(repo.deliveries[0]).toMatchObject({
      status: 'pending',
      errorCode: 'UNAVAILABLE',
      retryDelayMs: 30_000,
    });
    expect(repo.finished).toEqual([]);
    expect(repo.released).toEqual(['c1']);
  });

  it('gives up after the attempt budget and records the provider code', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    repo.deliveries[0]!.job.attempts = DEFAULT_RETRY_POLICY.maxAttempts - 1; // the next claim is the last attempt
    const sender = new ScriptedSender(() => ({ kind: 'retryable', code: 'UNAVAILABLE' }));

    await make(repo, sender).runOnce();

    expect(repo.deliveries[0]).toMatchObject({ status: 'failed', errorCode: 'UNAVAILABLE' });
    expect(repo.finished).toEqual([{ id: 'c1', status: 'failed', error: '1 delivery attempt(s) failed' }]);
  });

  it('marks a dead token invalid, deactivates the device, and does not retry it', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    repo.addDelivery('b');
    const sender = new ScriptedSender((m) =>
      m.token === 'token-a' ? { kind: 'invalid_token', code: 'UNREGISTERED' } : accepted,
    );

    await make(repo, sender).runOnce();

    expect(sender.sent).toHaveLength(2);
    expect(repo.invalidated).toEqual([{ deviceId: 'd-a', reason: 'UNREGISTERED' }]);
    expect(repo.deliveries.map((d) => d.status)).toEqual(['invalid_token', 'accepted']);
    expect(repo.finished[0]!.status).toBe('partially_failed');
  });

  it('fails a delivery whose device is gone without calling the provider', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a', null);
    const sender = new ScriptedSender(() => accepted);
    await make(repo, sender).runOnce();
    expect(sender.sent).toHaveLength(0);
    expect(repo.deliveries[0]).toMatchObject({ status: 'failed', errorCode: 'DEVICE_INACTIVE' });
  });

  it('does not retry a permanent refusal', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    const sender = new ScriptedSender(() => ({ kind: 'failed', code: 'INVALID_ARGUMENT' }));
    await make(repo, sender).runOnce();
    expect(sender.sent).toHaveLength(1);
    expect(repo.deliveries[0]).toMatchObject({ status: 'failed', errorCode: 'INVALID_ARGUMENT' });
  });

  it('treats a throwing provider as retryable instead of crashing the run', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    const sender: PushSender = {
      dryRun: false,
      send: async () => {
        throw new Error('boom');
      },
    };
    await make(repo, sender).runOnce();
    expect(repo.deliveries[0]).toMatchObject({ status: 'pending', errorCode: 'SENDER_ERROR' });
  });

  it('records dry-run acceptance as "dry_run", not as a delivery', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    await make(repo, new ScriptedSender(() => accepted, true)).runOnce();
    expect(repo.deliveries[0]!.status).toBe('dry_run');
  });

  it('never reports FCM acceptance as client receipt', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    repo.addDelivery('a');
    await make(repo, new ScriptedSender(() => accepted)).runOnce();
    const counts = await repo.deliveryCounts();
    expect(counts.accepted).toBe(1);
    expect(counts.received).toBe(0);
  });

  it('respects the concurrency cap', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    for (let i = 0; i < 12; i += 1) repo.addDelivery(`d${i}`);
    let inFlight = 0;
    let peak = 0;
    const sender: PushSender = {
      dryRun: false,
      send: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return accepted;
      },
    };
    await make(repo, sender, { concurrency: 3 }).runOnce();
    expect(peak).toBeLessThanOrEqual(3);
    expect(repo.deliveries.every((d) => d.status === 'accepted')).toBe(true);
  });

  it('hands the campaign back when the run time budget is spent', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ fannedOutAt: new Date() })];
    for (let i = 0; i < 4; i += 1) repo.addDelivery(`d${i}`);
    let clock = 0;
    const dispatcher = new NotificationDispatcher(
      { repo, sender: new ScriptedSender(() => accepted), now: () => (clock += 1_000) },
      { ...DEFAULT_DISPATCHER_OPTIONS, retry: DEFAULT_RETRY_POLICY, batchSize: 2, maxRunMs: 500 },
    );
    await dispatcher.runOnce();
    expect(repo.released).toEqual(['c1']);
    expect(repo.finished).toEqual([]);
    expect(repo.deliveries.filter((d) => d.status === 'accepted')).toHaveLength(2);
  });

  it('shares one run between overlapping callers in the same process', async () => {
    const repo = new FakeRepo();
    const dispatcher = make(repo, new ScriptedSender(() => accepted));
    await Promise.all([dispatcher.runOnce(), dispatcher.runOnce(), dispatcher.runOnce()]);
    expect(repo.claimDueCampaigns).toHaveBeenCalledTimes(1);
  });

  it('releases a campaign whose processing threw, and keeps going', async () => {
    const repo = new FakeRepo();
    repo.campaigns = [campaign({ id: 'bad' }), campaign({ id: 'good', fannedOutAt: new Date() })];
    repo.fanOut.mockRejectedValueOnce(new Error('db down'));
    const summary = await make(repo, new ScriptedSender(() => accepted)).runOnce();
    expect(repo.released).toContain('bad');
    expect(summary.campaigns).toBe(2);
  });

  it('survives a failing claim by returning an empty summary', async () => {
    const repo = new FakeRepo();
    repo.claimDueCampaigns.mockRejectedValueOnce(new Error('db down'));
    const summary = await make(repo, new ScriptedSender(() => accepted)).runOnce();
    expect(summary.campaigns).toBe(0);
  });
});
