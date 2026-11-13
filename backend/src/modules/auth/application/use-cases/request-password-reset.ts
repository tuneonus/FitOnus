import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type { KeyedHasher } from '../../../../shared/security/keyed-hasher.js';
import { randomId, randomOtp } from '../../../../shared/security/random.js';
import {
  minutesBefore,
  otpDigestInput,
  resetExpiry,
  type PasswordResetSettings,
} from '../../domain/password-reset.js';
import type {
  ClientMeta,
  Clock,
  PasswordResetFailureEvent,
  PasswordResetNotifier,
  PasswordResetTokenRepository,
  UserAccountsPort,
} from '../ports.js';

const truncate = (value: string | null, max: number): string | null =>
  value === null ? null : value.slice(0, max);

const errorNameOf = (error: unknown): string => (error instanceof Error ? error.name : 'UnknownError');

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts a password reset: issues a 6-digit one-time code and hands it to the notifier.
 *
 * No account enumeration: `execute` resolves with the same (empty) result whether the e-mail is
 * unknown, belongs to a disabled account, is throttled or in cooldown, or got a code; nothing it does after the
 * account lookup can fail the request; the e-mail is sent after the work is done without being
 * awaited; and the call never returns faster than `minResponseMs`.
 */
export class RequestPasswordResetUseCase {
  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      tokens: PasswordResetTokenRepository;
      keyedHasher: KeyedHasher;
      notifier: PasswordResetNotifier;
      uow: UnitOfWork;
      clock: Clock;
      settings: PasswordResetSettings;
      /** Receives secret-free failure signals (issue/delivery). Must not throw; if it does it is ignored. */
      onFailure?: (event: PasswordResetFailureEvent) => void;
      /** Injectable for tests; production waits on a real timer. */
      delay?: (ms: number) => Promise<void>;
    },
  ) {}

  async execute(input: { email: string }, meta: ClientMeta): Promise<void> {
    const wait = this.deps.settings.minResponseMs > 0 ? (this.deps.delay ?? sleep) : undefined;
    await Promise.all([this.process(input.email, meta), wait?.(this.deps.settings.minResponseMs)]);
  }

  private async process(email: string, meta: ClientMeta): Promise<void> {
    // A failure here does not depend on whether the account exists, so letting it surface leaks nothing.
    const account = await this.deps.accounts.findCredentialsByEmail(email);
    // Disabled accounts never receive a token. Unknown and disabled look identical to the caller.
    if (!account || account.status !== 'active') return;

    let issued: { otp: string; expiresAt: Date } | null;
    try {
      issued = await this.issue(account.id, meta);
    } catch (error) {
      // Surfacing this would reveal that the account exists, so report it out-of-band only.
      this.report({ stage: 'issue', userId: account.id, errorName: errorNameOf(error) });
      return;
    }
    if (issued) this.dispatch(account.id, { email: account.email, ...issued });
  }

  /** Returns null when the per-user cooldown or hourly throttle swallowed the request. */
  private issue(userId: string, meta: ClientMeta): Promise<{ otp: string; expiresAt: Date } | null> {
    const { tokens, keyedHasher, settings } = this.deps;
    const now = this.deps.clock();
    const otp = randomOtp(); // crypto.randomInt: uniform 000000-999999
    const id = randomId();
    const expiresAt = resetExpiry(now, settings.tokenTtlMinutes);

    return this.deps.uow.run(async () => {
      await tokens.lockUser(userId); // concurrent requests for one user queue up, so the counts below are exact
      // Resend cooldown: a code issued less than `resendCooldownSeconds` ago blocks a new one (silently).
      if (settings.resendCooldownSeconds > 0) {
        const cooldownStart = new Date(now.getTime() - settings.resendCooldownSeconds * 1000);
        if ((await tokens.countCreatedSince(userId, cooldownStart)) > 0) return null;
      }
      const recent = await tokens.countCreatedSince(
        userId,
        minutesBefore(now, settings.requestWindowMinutes),
      );
      if (recent >= settings.maxRequestsPerWindow) return null;

      // Only the newest code works: older outstanding ones are dead from here on.
      await tokens.invalidateOutstanding(userId, now);
      await tokens.create({
        id,
        userId,
        tokenHash: keyedHasher.digest(otpDigestInput(id, otp)),
        createdAt: now,
        expiresAt,
        requestIp: truncate(meta.ip, 64),
        userAgent: truncate(meta.userAgent, 512),
      });
      return { otp, expiresAt };
    });
  }

  /** Fire-and-forget: provider latency or failure must neither delay nor change the HTTP response. */
  private dispatch(userId: string, message: { email: string; otp: string; expiresAt: Date }): void {
    void Promise.resolve()
      .then(() => this.deps.notifier.send(message))
      .catch((error: unknown) => {
        this.report({ stage: 'deliver', userId, errorName: errorNameOf(error) });
      });
  }

  private report(event: PasswordResetFailureEvent): void {
    try {
      this.deps.onFailure?.(event);
    } catch {
      // Observability must never break the flow.
    }
  }
}
