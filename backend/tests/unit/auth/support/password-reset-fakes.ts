import type {
  NewPasswordResetToken,
  PasswordResetMessage,
  PasswordResetNotifier,
  PasswordResetTokenRepository,
} from '../../../../src/modules/auth/application/ports.js';
import type { PasswordResetToken } from '../../../../src/modules/auth/domain/password-reset.js';

/** Deterministic, hand-advanced clock. Never reads the wall clock (dev machine is IST, CI is UTC). */
export class MutableClock {
  private current: Date;
  constructor(start = new Date('2026-03-10T10:00:00.000Z')) {
    this.current = start;
  }
  readonly now = (): Date => new Date(this.current.getTime());
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(date: Date): void {
    this.current = date;
  }
}

export const MINUTE = 60_000;

type NotifierMode = 'ok' | 'reject' | 'throw' | 'hang';

/**
 * Test-only notifier: records what a real delivery adapter would receive. It stands in for the e-mail
 * provider that does not exist yet; production code never ships a fake mailer.
 */
export class RecordingNotifier implements PasswordResetNotifier {
  readonly sent: PasswordResetMessage[] = [];
  attempts = 0;
  mode: NotifierMode = 'ok';
  /** Error message used by 'reject'/'throw'; deliberately echoes the token like a sloppy provider SDK. */
  failureMessage = (message: PasswordResetMessage): string => `provider failed for otp ${message.otp}`;

  send(message: PasswordResetMessage): Promise<void> {
    this.attempts += 1;
    if (this.mode === 'throw') throw new TypeError(this.failureMessage(message));
    if (this.mode === 'reject') return Promise.reject(new RangeError(this.failureMessage(message)));
    if (this.mode === 'hang') return new Promise<void>(() => undefined);
    this.sent.push(message);
    return Promise.resolve();
  }

  get last(): PasswordResetMessage {
    const message = this.sent.at(-1);
    if (!message) throw new Error('No password reset message was sent');
    return message;
  }
}

/** Flushes microtasks and one macrotask so detached notifier work has run. */
export const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

interface Row extends PasswordResetToken {
  requestIp: string | null;
  userAgent: string | null;
}

/** In-memory token store with the same semantics as the PostgreSQL repository (minus real locking). */
export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  readonly rows = new Map<string, Row>();
  failCreate = false;
  lockCalls = 0;

  lockUser(): Promise<void> {
    this.lockCalls += 1;
    return Promise.resolve();
  }

  countCreatedSince(userId: string, since: Date): Promise<number> {
    const count = [...this.rows.values()].filter(
      (row) => row.userId === userId && row.createdAt.getTime() > since.getTime(),
    ).length;
    return Promise.resolve(count);
  }

  invalidateOutstanding(userId: string, now: Date): Promise<number> {
    let changed = 0;
    for (const row of this.rows.values()) {
      if (row.userId === userId && row.usedAt === null) {
        row.usedAt = now;
        changed += 1;
      }
    }
    return Promise.resolve(changed);
  }

  create(token: NewPasswordResetToken): Promise<void> {
    if (this.failCreate) return Promise.reject(new Error('simulated storage outage'));
    if ([...this.rows.values()].some((row) => row.tokenHash === token.tokenHash)) {
      return Promise.reject(new Error('duplicate token_hash'));
    }
    this.rows.set(token.id, { ...token, usedAt: null, failedAttempts: 0 });
    return Promise.resolve();
  }

  findActiveByUser(userId: string, now: Date, maxAttempts: number): Promise<PasswordResetToken | null> {
    const live = [...this.rows.values()]
      .filter(
        (row) =>
          row.userId === userId &&
          row.usedAt === null &&
          row.expiresAt.getTime() > now.getTime() &&
          row.failedAttempts < maxAttempts,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(live[0] ? { ...live[0] } : null);
  }

  recordFailedAttempt(id: string): Promise<number> {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(0);
    row.failedAttempts += 1;
    return Promise.resolve(row.failedAttempts);
  }

  consume(id: string, now: Date, maxAttempts: number): Promise<{ userId: string } | null> {
    // Synchronous check-and-set: atomic in a single-threaded runtime, like the single UPDATE in SQL.
    const row = this.rows.get(id);
    if (!row || row.usedAt !== null || row.expiresAt.getTime() <= now.getTime()) return Promise.resolve(null);
    if (row.failedAttempts >= maxAttempts) return Promise.resolve(null);
    row.usedAt = now;
    return Promise.resolve({ userId: row.userId });
  }

  purge(): Promise<number> {
    return Promise.resolve(0);
  }

  /** Test convenience: outstanding (redeemable-by-state) rows of a user. */
  outstanding(userId: string): Row[] {
    return [...this.rows.values()].filter((row) => row.userId === userId && row.usedAt === null);
  }
}
