import type { Actor } from '../../../../shared/auth/actor.js';
import { assertPermission } from '../../../../shared/auth/actor.js';
import { conflict, notFound } from '../../../../shared/errors/app-error.js';
import type { SessionRepository } from '../../../auth/index.js';
import {
  assertStatusTransition,
  toUserView,
  type UserRepository,
  type UserStatus,
  type UserView,
} from '../../../users/index.js';
import type { AdminRepository } from '../ports.js';

export class AdminChangeUserStatusUseCase {
  constructor(
    private readonly deps: {
      users: UserRepository;
      sessions: SessionRepository;
      adminRepo: AdminRepository;
    },
  ) {}

  async execute(
    actor: Actor,
    userId: string,
    target: UserStatus,
    reason?: string,
    meta?: { ip?: string | null; userAgent?: string | null },
  ): Promise<UserView> {
    assertPermission(actor, 'users:manage-status');
    const user = await this.deps.users.findById(userId);
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found.');
    assertStatusTransition(actor.userId, user, target);

    const updated = await this.deps.users.changeStatus(userId, user.version, target);
    if (!updated) throw conflict('VERSION_CONFLICT', 'The user was modified by another request. Retry.');

    // If suspending/disabling account, revoke all sessions immediately
    if (target === 'disabled') {
      await this.deps.sessions.revokeAllForUser(userId, 'account_disabled');
    }

    // Record audit log
    await this.deps.adminRepo.recordAuditLog({
      adminId: actor.userId,
      action: target === 'disabled' ? 'user.suspend' : 'user.reactivate',
      targetUserId: userId,
      details: {
        previousStatus: user.status,
        newStatus: target,
        reason: reason ?? null,
      },
      ipAddress: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    });

    return toUserView(updated);
  }
}
