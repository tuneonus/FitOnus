import type { Actor } from '../../../../shared/auth/actor.js';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.js';
import { AppError, unprocessable } from '../../../../shared/errors/app-error.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import { assertPasswordPolicy } from '../../../../shared/security/password-policy.js';
import { sessionRevoked } from '../errors.js';
import type { SessionRepository, UserAccountsPort } from '../ports.js';

/** Changes the caller's password and signs out every other session in the same transaction. */
export class ChangePasswordUseCase {
  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      sessions: SessionRepository;
      passwordHasher: PasswordHasher;
      uow: UnitOfWork;
    },
  ) {}

  async execute(
    actor: Actor,
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ revokedSessions: number }> {
    const { accounts, passwordHasher } = this.deps;
    const account = await accounts.findCredentialsById(actor.userId);
    if (!account) throw sessionRevoked();

    // 422, not 401: the session is valid; only the supplied password is wrong.
    if (!(await passwordHasher.verify(account.passwordHash, input.currentPassword))) {
      throw unprocessable('INVALID_CREDENTIALS', 'The current password is incorrect.');
    }
    assertPasswordPolicy(input.newPassword);
    if (input.newPassword === input.currentPassword) {
      throw new AppError(
        'validation',
        'PASSWORD_POLICY_VIOLATION',
        'The new password must differ from the current one.',
      );
    }

    const passwordHash = await passwordHasher.hash(input.newPassword);
    return this.deps.uow.run(async () => {
      await accounts.updatePasswordHash(actor.userId, passwordHash);
      const revokedSessions = await this.deps.sessions.revokeAllForUser(actor.userId, 'password_change', {
        exceptSessionId: actor.sessionId,
      });
      return { revokedSessions };
    });
  }
}
