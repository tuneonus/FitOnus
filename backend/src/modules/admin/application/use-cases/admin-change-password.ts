import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import { AppError, unauthorized, unprocessable } from '../../../../shared/errors/app-error.js';
import type { PasswordHasher } from '../../../../shared/security/password-hasher.js';
import { assertPasswordPolicy } from '../../../../shared/security/password-policy.js';
import type { SessionRepository, UserAccountsPort } from '../../../auth/index.js';
import type { AdminRepository } from '../ports.js';

export interface AdminChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AdminChangePasswordResult {
  revokedSessions: number;
}

/**
 * Executes a secure password change for an authenticated administrator.
 * Enforces admin permissions, Argon2 password verification, minimum 12-char policy,
 * duplicate password rejection, session revocation for other devices, and audit logging.
 */
export class AdminChangePasswordUseCase {
  constructor(
    private readonly deps: {
      accounts: UserAccountsPort;
      sessions: SessionRepository;
      passwordHasher: PasswordHasher;
      adminRepo: AdminRepository;
    },
  ) {}

  async execute(
    actor: Actor,
    input: AdminChangePasswordInput,
    meta?: { ip?: string | null; userAgent?: string | null },
  ): Promise<AdminChangePasswordResult> {
    // 1. Enforce administrator permissions
    assertPermission(actor, 'admin:access');

    // 2. Fetch authenticated account credentials
    const account = await this.deps.accounts.findCredentialsById(actor.userId);
    if (!account) {
      throw unauthorized('SESSION_REVOKED', 'The session is no longer valid. Please sign in again.');
    }

    if (account.status !== 'active') {
      throw new AppError('forbidden', 'ACCOUNT_DISABLED', 'This administrator account is disabled.');
    }

    if (account.role !== 'admin') {
      throw new AppError(
        'forbidden',
        'FORBIDDEN',
        'Administrator privileges are required to perform this action.',
      );
    }

    // 3. Verify current password
    const matchesCurrent = await this.deps.passwordHasher.verify(
      account.passwordHash,
      input.currentPassword,
    );
    if (!matchesCurrent) {
      throw unprocessable('INVALID_CREDENTIALS', 'The current password is incorrect.');
    }

    // 4. Assert password policy (12 - 128 characters)
    assertPasswordPolicy(input.newPassword);

    // 5. Reject identical password
    if (input.newPassword === input.currentPassword) {
      throw new AppError(
        'validation',
        'PASSWORD_POLICY_VIOLATION',
        'The new password must differ from the current one.',
      );
    }

    // 6. Hash new password with Argon2
    const newHash = await this.deps.passwordHasher.hash(input.newPassword);

    // 7. Update password hash in PostgreSQL
    await this.deps.accounts.updatePasswordHash(actor.userId, newHash);

    // 8. Invalidate all other active sessions for this administrator
    const revokedSessions = await this.deps.sessions.revokeAllForUser(
      actor.userId,
      'password_change',
      {
        exceptSessionId: actor.sessionId,
      },
    );

    // 9. Record security audit event without sensitive values
    await this.deps.adminRepo.recordAuditLog({
      adminId: actor.userId,
      action: 'admin.password_change',
      targetUserId: actor.userId,
      details: {
        revokedOtherSessions: revokedSessions,
      },
      ipAddress: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    });

    return { revokedSessions };
  }
}
