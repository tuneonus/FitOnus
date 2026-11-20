import type { Actor } from '../../../../shared/auth/actor.js';
import type { ImageLogger } from '../../../../shared/images/public-image-check.js';
import type { PrivateMedia, PrivateImageUploadInput } from '../../../../shared/private-media/index.js';
import { privateStorageNotConfigured } from '../../../../shared/private-media/index.js';
import type { AvatarRepository } from '../avatar-ports.js';
import { toAvatarView, type AvatarResponse } from '../avatar-view.js';

export interface UploadAvatarDeps {
  avatars: AvatarRepository;
  /** Null when private media is not configured: uploads then answer 503 and nothing else is affected. */
  media: PrivateMedia | null;
  logger?: ImageLogger | undefined;
}

/**
 * Sets (or replaces) the signed-in member's profile picture.
 *
 * 1. The picture is validated, converted (centre square, at most 400 px, WebP, no metadata) and written to the private
 *    bucket under a NEW random key owned by this member, together with its thumbnail.
 * 2. One statement then points the member's row at the new key. On a replacement the database queues the old picture
 *    and thumbnail for deletion in that same statement (trigger, migration 0026).
 * 3. If the row cannot be saved, what was just written is removed again (or queued), so a failed upload leaves nothing
 *    behind and the old avatar keeps working.
 * 4. After the commit the deletion worker is nudged, so the old picture normally disappears within moments. If that
 *    fails, the queue still holds it and the worker retries: nothing is lost.
 *
 * The member id comes from the session, never from the request, so nobody can set another member's picture.
 */
export class UploadAvatarUseCase {
  constructor(private readonly deps: UploadAvatarDeps) {}

  async execute(actor: Actor, input: PrivateImageUploadInput): Promise<AvatarResponse> {
    const { avatars, media } = this.deps;
    if (!media) throw privateStorageNotConfigured();

    const stored = await media.uploader.upload(actor.userId, 'avatar', input);
    let record;
    try {
      record = await avatars.save(actor.userId, {
        objectKey: stored.key,
        width: stored.width,
        height: stored.height,
        byteSize: stored.byteSize,
      });
    } catch (error) {
      await media.uploader.discard(stored);
      throw error;
    }
    media.purger.kick();
    return { avatar: toAvatarView(record, media.urls) };
  }
}
