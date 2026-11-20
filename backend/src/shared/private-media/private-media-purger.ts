import type { ImageLogger } from '../images/public-image-check.js';
import type { PrivateObjectStore } from '../storage/private-object-store.js';
import type { PrivateMediaDeletionQueue } from './deletion-queue.js';
import { isPrivateObjectKey } from './private-image-policy.js';

export interface PrivateMediaPurgerDeps {
  queue: PrivateMediaDeletionQueue;
  /** The PRIVATE store. This class cannot address any other bucket, so it cannot delete public media. */
  store: PrivateObjectStore;
  logger?: ImageLogger | undefined;
  batchSize?: number;
  /** How long a claimed object stays hidden from other workers. Must exceed one batch's worst-case duration. */
  leaseSeconds?: number;
  /** How often the background loop looks for due objects. */
  intervalMs?: number;
  /** Safety cap per `drain()` so one call cannot run forever against a queue that keeps filling. */
  maxBatchesPerDrain?: number;
  /**
   * PRIVATE_MEDIA_PURGE_ENABLED. When false this process never deletes on its own: `kick()` and `start()` do nothing
   * (another instance's loop picks the queued objects up) and only an explicit `drain()` works. Default true.
   */
  enabled?: boolean;
}

export interface DrainResult {
  deleted: number;
  failed: number;
  /** Rows dropped because their key was not a private key (cannot happen through the triggers). */
  rejected: number;
}

/**
 * Deletes the objects in the private deletion queue from the private bucket, retrying until storage accepts.
 *
 * - `kick()` is called after a request committed a deletion, so the object normally disappears within a second;
 * - the background loop (`start()`) picks up everything else: objects whose first attempt failed, rows queued by an
 *   account deletion or by a crash between commit and kick, and rows that another instance stopped working on;
 * - a failure never loses the row: it is counted and retried with exponential backoff (30 s up to 6 h). The reason
 *   kept is coarse (operation and HTTP status), never a URL or a response body.
 *
 * Deleting an object that is already gone succeeds, so a retry after a crash between "deleted" and "removed from the
 * queue" is harmless.
 */
export class PrivateMediaPurger {
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly intervalMs: number;
  private readonly maxBatches: number;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<DrainResult> | null = null;
  private rerun = false;
  private readonly enabled: boolean;

  constructor(private readonly deps: PrivateMediaPurgerDeps) {
    this.enabled = deps.enabled ?? true;
    this.batchSize = deps.batchSize ?? 25;
    this.leaseSeconds = deps.leaseSeconds ?? 120;
    this.intervalMs = deps.intervalMs ?? 30_000;
    this.maxBatches = deps.maxBatchesPerDrain ?? 20;
  }

  /** Processes due objects until none are left (or the per-call cap is reached). One drain at a time. */
  drain(): Promise<DrainResult> {
    if (this.inFlight) {
      this.rerun = true;
      return this.inFlight;
    }
    const run = this.runBatches().finally(() => {
      this.inFlight = null;
      if (this.rerun) {
        this.rerun = false;
        this.kick();
      }
    });
    this.inFlight = run;
    return run;
  }

  /** Starts a drain in the background and returns at once. Never throws: a failure is logged and retried by the loop. */
  kick(): void {
    if (!this.enabled) return;
    void this.drain().catch((error: unknown) => {
      this.deps.logger?.warn({ err: error }, 'Private media deletion pass failed');
    });
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => this.kick(), this.intervalMs);
    this.timer.unref();
    this.kick();
  }

  /** Stops the loop and waits for the pass in progress, so shutdown never abandons a half-done batch. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.rerun = false;
    await this.inFlight?.catch(() => undefined);
  }

  private async runBatches(): Promise<DrainResult> {
    const total: DrainResult = { deleted: 0, failed: 0, rejected: 0 };
    for (let batch = 0; batch < this.maxBatches; batch += 1) {
      const keys = await this.deps.queue.claimDue(this.batchSize, this.leaseSeconds);
      if (keys.length === 0) break;
      for (const key of keys) {
        const outcome = await this.deleteOne(key);
        total[outcome] += 1;
      }
      // A short batch means the queue is drained; a failed one is not retried in this pass (it is backed off).
      if (keys.length < this.batchSize) break;
    }
    return total;
  }

  private async deleteOne(key: string): Promise<keyof DrainResult> {
    const { queue, store, logger } = this.deps;
    if (!isPrivateObjectKey(key)) {
      // Never hand an unknown name to storage. The row can never succeed, so it is dropped (and noted) instead of
      // being retried forever.
      logger?.warn({ objects: 1 }, 'Dropped a deletion-queue row that is not a private key');
      await queue.complete(key);
      return 'rejected';
    }
    try {
      await store.delete(key);
      await queue.complete(key);
      return 'deleted';
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      logger?.warn({ reason }, 'Could not delete a private object yet; it stays queued');
      await queue.fail(key, reason).catch(() => undefined);
      return 'failed';
    }
  }
}
