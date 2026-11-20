import type { Actor } from '../../../../shared/auth/actor.js';
import type { ImageLogger } from '../../../../shared/images/public-image-check.js';
import type { PrivateMedia } from '../../../../shared/private-media/index.js';
import type { AvatarRepository } from '../avatar-ports.js';
import { toAvatarView, type AvatarResponse } from '../avatar-view.js';

export interface GetAvatarDeps {
  avatars: AvatarRepository;
  /** Null when private media is not configured: nobody can have an avatar then, and the answer is "none", not an error. */
  media: PrivateMedia | null;
  logger?: ImageLogger | undefined;
}

/**
 * The signed-in member's own profile picture, with fresh short-lived URLs. Only ever reads the row of the actor: the
 * request carries no id, so there is nothing to tamper with to see someone else's picture.
 */
export class GetAvatarUseCase {
  constructor(private readonly deps: GetAvatarDeps) {}

  async execute(actor: Actor): Promise<AvatarResponse> {
    const { avatars, media, logger } = this.deps;
    if (!media) return { avatar: null };
    const record = await avatars.find(actor.userId);
    const avatar = toAvatarView(record, media.urls);
    if (record && !avatar)
      logger?.warn({ kind: 'avatar' }, "A stored avatar key is not the owner's own; showing none");
    return { avatar };
  }
}
