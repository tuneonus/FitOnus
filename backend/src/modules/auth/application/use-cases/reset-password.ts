import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import type { KeyedHasher } from '../../../../shared/security/keyed-hasher.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import { assertPasswordPolicy } from '../../../../shared/security/password-policy.js';
import { isWellFormedOtp, otpDigestInput, type PasswordResetSettings } from '../../domain/password-reset.js';
import { invalidResetCode } from '../errors.js';
import type { Clock, PasswordResetTokenRepository, SessionRepository, UserAccountsPort } from '../ports.js';

/**
 * Completes a password reset with the e-mail address and the 6-digit OTP from the e-mail.
 *
 * Verification and redemption are separate transactions on purpose:
 *   1. verify (per-user lock): find the account's newest live OTP and compare in constant time. A wrong
 *      guess is COUNTED AND COMMITTED (so it cannot be rolled back) and the OTP dies after
 *      `maxVerificationAttempts` wrong guesses, whatever the attacker does afterwards.
 *   2. hash the new password (slow, and only reached with a correct OTP: no CPU amplification).
 *   3. redeem atomically (one winner), set the password, supersede other OTPs, revoke every session.
 *
 * It does not sign the user in. Every way a code can be unusable (unknown e-mail, wrong, malformed,
 * expired, used, superseded, locked out, disabled account) produces the same error.
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      sessions: SessionRepository;
      tokens: PasswordResetTokenRepository;
      keyedHasher: KeyedHasher;
      passwordHasher: PasswordHasher;
      uow: UnitOfWork;
      clock: Clock;
      settings: Pick<PasswordResetSettings, 'maxVerificationAttempts'>;
    },
  ) {}

  async execute(input: { email: string; otp: string; newPassword: string }): Promise<void> {
    const { tokens, keyedHasher, passwordHasher, accounts, uow } = this.deps;
    const max = this.deps.settings.maxVerificationAttempts;

    // The password policy says nothing about the OTP, and a rejected password must not burn an attempt.
    assertPasswordPolicy(input.newPassword);
    if (!isWellFormedOtp(input.otp)) throw invalidResetCode();

    const account = await accounts.findCredentialsByEmail(input.email);

    const verified = await uow.run(async () => {
      if (!account || account.status !== 'active') return null;
      await tokens.lockUser(account.id); // concurrent guesses queue up, so the attempt cap is exact
      const stored = await tokens.findActiveByUser(account.id, this.deps.clock(), max);
      if (!stored) return null;
      if (!keyedHasher.matches(otpDigestInput(stored.id, input.otp), stored.tokenHash)) {
        await tokens.recordFailedAttempt(stored.id); // committed: we return instead of throwing
        return null;
      }
      return { userId: account.id, tokenId: stored.id };
    });
    if (!verified) throw invalidResetCode();

    const passwordHash = await passwordHasher.hash(input.newPassword); // slow work stays outside transactions

    await uow.run(async () => {
      const now = this.deps.clock();
      const redeemed = await tokens.consume(verified.tokenId, now, max);
      if (!redeemed) throw invalidResetCode(); // lost a race, or it expired while we were hashing

      const state = await accounts.getAccountState(redeemed.userId);
      // Throwing rolls the redemption back too; a disabled or deleted account cannot be reset.
      if (!state || state.status !== 'active') throw invalidResetCode();

      await accounts.updatePasswordHash(redeemed.userId, passwordHash);
      await tokens.invalidateOutstanding(redeemed.userId, now);
      // 'password_change' is the existing revoke reason (the DB CHECK constraint has no dedicated one).
      await this.deps.sessions.revokeAllForUser(redeemed.userId, 'password_change');
    });
  }
}
