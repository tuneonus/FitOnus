/**
 * The durable list of private objects that must be removed from the private bucket.
 *
 * Why a queue and not a delete call next to each database change: a member's rows are removed by database cascades
 * too (deleting an account removes every row of theirs), and a cascade cannot call storage. So the DATABASE records
 * which objects are no longer wanted, in the same transaction as the change that made them unwanted (triggers on
 * `member_avatars` and `progress_photos`, migrations 0026 and 0027), and a worker deletes them afterwards, retrying
 * until storage says yes. A crash, an R2 outage or a deploy in between loses nothing: the row is still there.
 *
 * Only ever holds PRIVATE keys (a CHECK on the table, and the purger checks again). Public media is never queued here.
 */
export interface PrivateMediaDeletionQueue {
  /** Idempotent: a key that is already queued stays queued once. */
  enqueue(keys: readonly string[]): Promise<void>;
  /**
   * Takes up to `limit` due keys and hides them from other workers for `leaseSeconds`, so two server instances never
   * delete the same object at once. A worker that dies simply lets the lease run out.
   */
  claimDue(limit: number, leaseSeconds: number): Promise<string[]>;
  /** The object is gone: remove it from the queue. */
  complete(key: string): Promise<void>;
  /** The attempt failed: count it, remember a coarse reason, and retry later with exponential backoff. */
  fail(key: string, reason: string): Promise<void>;
  /** How many objects still wait (due or not). */
  pendingCount(): Promise<number>;
}
