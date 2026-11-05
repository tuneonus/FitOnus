import { randomUUID } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import type { KeyedHasher } from '../security/keyed-hasher.js';
import { canonicalJson } from './fingerprint.js';

export interface IdempotencyKeyRef {
  /** Who is retrying, e.g. the actor's user id. Keys never collide across actors. */
  scope: string;
  /** Logical operation, e.g. "users.create". */
  operation: string;
  /** Client-supplied Idempotency-Key header. */
  key: string;
}

export interface IdempotencyRecord {
  fingerprint: string;
  status: 'in_progress' | 'completed';
  response: unknown;
}

/** Storage port; the PostgreSQL implementation relies on a primary key for atomic claims. */
export interface IdempotencyStore {
  /** Returns true when this caller now owns the key (new, expired or abandoned record). */
  claim(
    ref: IdempotencyKeyRef,
    claim: { fingerprint: string; lockToken: string; leaseSeconds: number; ttlSeconds: number },
  ): Promise<boolean>;
  find(ref: IdempotencyKeyRef): Promise<IdempotencyRecord | null>;
  /** Marks the claim completed. Runs inside the caller's transaction; false if the lease was lost. */
  complete(ref: IdempotencyKeyRef, lockToken: string, response: unknown): Promise<boolean>;
  /** Deletes an unfinished claim so a retry can proceed immediately. */
  release(ref: IdempotencyKeyRef, lockToken: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

export interface IdempotentResult<T> {
  value: T;
  replayed: boolean;
}

/** Call inside the operation's transaction, after its writes, with the JSON-serialisable result. */
export type CompleteIdempotentWork<T> = (value: T) => Promise<void>;

const MAX_CLAIM_ATTEMPTS = 3;

/**
 * Makes a mutation safe to retry.
 *
 * 1. Atomically claim (scope, operation, key) with a short lease.
 * 2. Same key + different payload → IDEMPOTENCY_KEY_REUSED (422).
 * 3. Completed → replay the stored result without re-running the work.
 * 4. Still running → IDEMPOTENCY_REQUEST_IN_PROGRESS (409), retry later.
 * 5. The work stores its result via `complete()` in its own transaction, so the
 *    result is persisted if and only if the business writes commit.
 * 6. Failure deletes the claim; a crash leaves a lease that simply expires.
 *
 * Idempotency is not a substitute for transactions or constraints; it only
 * prevents a retried request from being executed twice.
 */
export class IdempotencyService {
  constructor(
    private readonly store: IdempotencyStore,
    private readonly hasher: KeyedHasher,
    private readonly options: { ttlSeconds: number; leaseSeconds: number },
  ) {}

  async execute<T>(
    ref: IdempotencyKeyRef,
    payload: unknown,
    work: (complete: CompleteIdempotentWork<T>) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const fingerprint = this.hasher.digest(`${ref.operation}\n${canonicalJson(payload)}`);

    for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
      const lockToken = randomUUID();
      const claimed = await this.store.claim(ref, {
        fingerprint,
        lockToken,
        leaseSeconds: this.options.leaseSeconds,
        ttlSeconds: this.options.ttlSeconds,
      });
      if (claimed) return this.runClaimed(ref, lockToken, work);

      const existing = await this.store.find(ref);
      // Released or expired between our claim and read: try to claim again.
      if (!existing) continue;
      if (existing.fingerprint !== fingerprint) {
        throw new AppError(
          'unprocessable',
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used with a different request payload.',
        );
      }
      if (existing.status === 'completed') return { value: existing.response as T, replayed: true };
      throw inProgress();
    }
    throw inProgress();
  }

  private async runClaimed<T>(
    ref: IdempotencyKeyRef,
    lockToken: string,
    work: (complete: CompleteIdempotentWork<T>) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    let completed = false;
    const complete: CompleteIdempotentWork<T> = async (value) => {
      if (!(await this.store.complete(ref, lockToken, value))) throw inProgress();
      completed = true;
    };

    try {
      const value = await work(complete);
      if (!completed) throw new Error(`Idempotent operation "${ref.operation}" did not call complete()`);
      return { value, replayed: false };
    } catch (error) {
      // Best effort: if this fails too, the lease expires and the key becomes claimable again.
      await this.store.release(ref, lockToken).catch(() => undefined);
      throw error;
    }
  }
}

const inProgress = () =>
  new AppError(
    'conflict',
    'IDEMPOTENCY_REQUEST_IN_PROGRESS',
    'A request with this Idempotency-Key is still being processed. Retry later.',
  );
