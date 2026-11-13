import { finalCampaignStatus, nextRetryDelayMs, type RetryPolicy } from '../../domain/notification-policy.js';
import type { CampaignRecord, DeliveryJob, DispatchRepository, PushSender } from '../ports.js';

export interface DispatcherLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface DispatcherOptions {
  retry: RetryPolicy;
  /** Campaigns leased per tick. */
  campaignsPerTick: number;
  /** Deliveries leased from the database at once. */
  batchSize: number;
  /** Concurrent provider requests within a batch. */
  concurrency: number;
  /** How long a leased campaign/delivery stays reserved if its worker dies. */
  leaseMs: number;
  /** A run hands the campaign back after this long, so one huge campaign cannot starve the rest. */
  maxRunMs: number;
  pollIntervalMs: number;
}

export const DEFAULT_DISPATCHER_OPTIONS: Omit<DispatcherOptions, 'retry'> = {
  campaignsPerTick: 3,
  batchSize: 100,
  concurrency: 10,
  leaseMs: 5 * 60_000,
  maxRunMs: 45_000,
  pollIntervalMs: 10_000,
};

export interface DispatchSummary {
  campaigns: number;
  attempted: number;
  accepted: number;
  retried: number;
  failed: number;
  invalidTokens: number;
}

const emptySummary = (): DispatchSummary => ({
  campaigns: 0,
  attempted: 0,
  accepted: 0,
  retried: 0,
  failed: 0,
  invalidTokens: 0,
});

/**
 * Executes scheduled campaigns. Any number of server instances may run one: campaigns and deliveries are
 * leased with FOR UPDATE SKIP LOCKED, fan-out is idempotent, and every state change is a guarded UPDATE, so a
 * message is attempted by one worker at a time and a crashed worker's leases simply expire.
 */
export class NotificationDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<DispatchSummary> | null = null;
  private rerun = false;
  private stopped = false;

  constructor(
    private readonly deps: {
      repo: DispatchRepository;
      sender: PushSender;
      logger?: DispatcherLogger;
      now?: () => number;
    },
    private readonly options: DispatcherOptions,
  ) {}

  /** Polls on an interval. Safe to call once at start-up; `stop()` ends it. */
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.runOnce(), this.options.pollIntervalMs);
    this.timer.unref();
    void this.runOnce();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running?.catch(() => undefined);
  }

  /** Request a run soon (e.g. right after "send now"). Coalesces with a run already in progress. */
  kick(): void {
    if (this.stopped) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    void this.runOnce();
  }

  /** One pass. Concurrent calls in the same process share the run in flight. */
  runOnce(): Promise<DispatchSummary> {
    if (this.running) return this.running;
    const run = this.execute()
      .catch((error: unknown) => {
        this.deps.logger?.error({ err: error }, 'Notification dispatch run failed');
        return emptySummary();
      })
      .finally(() => {
        this.running = null;
        if (this.rerun && !this.stopped) {
          this.rerun = false;
          void this.runOnce();
        }
      });
    this.running = run;
    return run;
  }

  private async execute(): Promise<DispatchSummary> {
    const summary = emptySummary();
    const campaigns = await this.deps.repo.claimDueCampaigns(
      this.options.campaignsPerTick,
      this.options.leaseMs,
    );
    summary.campaigns = campaigns.length;
    for (const campaign of campaigns) {
      if (this.stopped) {
        await this.deps.repo.releaseLease(campaign.id);
        continue;
      }
      try {
        await this.processCampaign(campaign, summary);
      } catch (error) {
        // Leave the campaign leased-and-expiring rather than guessing at an end state: the next lease retries it.
        this.deps.logger?.error(
          { err: error, campaignId: campaign.id },
          'Notification campaign processing failed',
        );
        await this.deps.repo.releaseLease(campaign.id).catch(() => undefined);
      }
    }
    if (summary.attempted > 0) this.deps.logger?.info({ ...summary }, 'Notification dispatch run finished');
    return summary;
  }

  private async processCampaign(campaign: CampaignRecord, summary: DispatchSummary): Promise<void> {
    const now = this.deps.now ?? Date.now;
    const deadline = now() + this.options.maxRunMs;

    if (!campaign.fannedOutAt) {
      const fanOut = await this.deps.repo.fanOut(campaign);
      this.deps.logger?.info({ campaignId: campaign.id, ...fanOut }, 'Notification campaign fanned out');
      if (fanOut.notificationCount > 0 && fanOut.deliveryCount === 0) {
        // The inbox rows exist, but no member has an active registered device, so nothing can reach a phone.
        this.deps.logger?.warn(
          { campaignId: campaign.id, notificationCount: fanOut.notificationCount },
          'Campaign has inbox notifications but no active push devices to deliver to',
        );
      }
    }

    for (;;) {
      const jobs = await this.deps.repo.claimDeliveries(
        campaign.id,
        this.options.batchSize,
        this.options.leaseMs,
        this.options.retry.maxAttempts,
      );
      if (jobs.length === 0) break;
      await this.sendBatch(jobs, summary);
      if (now() >= deadline || this.stopped) {
        await this.deps.repo.releaseLease(campaign.id);
        return;
      }
    }

    const counts = await this.deps.repo.deliveryCounts(campaign.id);
    if (counts.pending > 0 || counts.processing > 0) {
      // Waiting on a retry back-off (or another worker): hand the campaign back for a later tick.
      await this.deps.repo.releaseLease(campaign.id);
      return;
    }
    const status = finalCampaignStatus(counts);
    const lastError =
      status === 'sent' ? null : `${counts.failed + counts.invalidToken} delivery attempt(s) failed`;
    await this.deps.repo.finish(campaign.id, status, lastError);
  }

  private async sendBatch(jobs: DeliveryJob[], summary: DispatchSummary): Promise<void> {
    let next = 0;
    const worker = async (): Promise<void> => {
      for (let index = next++; index < jobs.length; index = next++) {
        await this.sendOne(jobs[index]!, summary);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, jobs.length) }, worker));
  }

  private async sendOne(job: DeliveryJob, summary: DispatchSummary): Promise<void> {
    summary.attempted += 1;
    const { repo, sender } = this.deps;

    // Only opaque ids and provider error codes are logged: never the device token, title or body.
    const logOutcome = (outcome: string, code: string): void =>
      this.deps.logger?.warn(
        { campaignId: job.campaignId, deliveryId: job.id, notificationId: job.notificationId, outcome, code },
        'Push delivery not accepted',
      );

    if (!job.token) {
      logOutcome('failed', 'DEVICE_INACTIVE');
      summary.failed += 1;
      await repo.recordOutcome(job.id, { kind: 'failed', errorCode: 'DEVICE_INACTIVE' });
      return;
    }

    let result;
    try {
      result = await sender.send({
        token: job.token,
        title: job.title,
        body: job.body,
        data: {
          notificationId: job.notificationId,
          category: job.category,
          ...(job.destination ? { destination: job.destination } : {}),
        },
        channelId: 'remote-updates',
      });
    } catch {
      result = { kind: 'retryable', code: 'SENDER_ERROR' } as const;
    }

    switch (result.kind) {
      case 'accepted':
        summary.accepted += 1;
        await repo.recordOutcome(job.id, {
          kind: 'accepted',
          messageId: result.messageId,
          dryRun: sender.dryRun,
        });
        return;
      case 'invalid_token':
        logOutcome('invalid_token', result.code);
        summary.invalidTokens += 1;
        await repo.recordOutcome(job.id, { kind: 'invalid_token', errorCode: result.code });
        if (job.deviceId) await repo.invalidateDevice(job.deviceId, result.code);
        return;
      case 'retryable':
        logOutcome('retryable', result.code);
        if (job.attempts >= this.options.retry.maxAttempts) {
          summary.failed += 1;
          await repo.recordOutcome(job.id, { kind: 'failed', errorCode: result.code });
          return;
        }
        summary.retried += 1;
        await repo.recordOutcome(job.id, {
          kind: 'retry',
          errorCode: result.code,
          delayMs: nextRetryDelayMs(this.options.retry, job.attempts, result.retryAfterMs),
        });
        return;
      case 'failed':
        logOutcome('failed', result.code);
        summary.failed += 1;
        await repo.recordOutcome(job.id, { kind: 'failed', errorCode: result.code });
    }
  }
}
