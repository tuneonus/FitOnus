import { assertPermission, type Actor } from '../../../../shared/auth/actor.js';
import { conflict, notFound } from '../../../../shared/errors/app-error.js';
import { assertStatusTransition, type UserStatus } from '../../domain/user.js';
import type { UserRepository } from '../ports.js';
import { toUserView, type UserView } from '../user-view.js';

/**
 * Disables or re-enables an account. Disabled accounts are rejected on every
 * authenticated request and on refresh, because the auth module re-reads account
 * state from the database each time (fail closed, no cache to invalidate).
 */
export class ChangeUserStatusUseCase {
  constructor(private readonly deps: { users: UserRepository }) {}

  async execute(actor: Actor, userId: string, target: UserStatus): Promise<UserView> {
    assertPermission(actor, 'users:manage-status');
    const user = await this.deps.users.findById(userId);
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found.');
    assertStatusTransition(actor.userId, user, target);

    // Compare-and-set: a concurrent change between read and write is reported, never overwritten.
    const updated = await this.deps.users.changeStatus(userId, user.version, target);
    if (!updated) throw conflict('VERSION_CONFLICT', 'The user was modified by another request. Retry.');
    return toUserView(updated);
  }
}
