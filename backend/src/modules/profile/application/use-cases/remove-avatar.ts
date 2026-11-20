import type { Actor } from '../../../../shared/auth/actor.js';
import type { PrivateMedia } from '../../../../shared/private-media/index.js';
import type { AvatarRepository } from '../avatar-ports.js';
import type { AvatarResponse } from '../avatar-view.js';

export interface RemoveAvatarDeps {
  avatars: AvatarRepository;
  /** Null when private media is not configured. Removing still works: the deletion is queued and runs once it is. */
  media: PrivateMedia | null;
}

/**
 * Removes the signed-in member's profile picture. Idempotent: removing when there is none succeeds.
 *
 * Only the row is deleted here; the database queues the picture and its thumbnail for deletion in the same statement
 * (trigger, migration 0026), and the worker removes them from the private bucket, retrying until storage accepts. Public
 * media is never touched: the queue only accepts private keys and the worker only has the private store.
 */
export class RemoveAvatarUseCase {
  constructor(private readonly deps: RemoveAvatarDeps) {}

  async execute(actor: Actor): Promise<AvatarResponse> {
    const removed = await this.deps.avatars.remove(actor.userId);
    if (removed) this.deps.media?.purger.kick();
    return { avatar: null };
  }
}
