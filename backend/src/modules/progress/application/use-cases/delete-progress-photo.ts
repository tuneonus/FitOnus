import type { Actor } from '../../../../shared/auth/actor.js';
import { notFound } from '../../../../shared/errors/app-error.js';
import type { PrivateMedia } from '../../../../shared/private-media/index.js';
import type { ProgressPhotoRepository } from '../photo-ports.js';
import { galleryCounts, type ProgressPhotoGallery } from '../photo-view.js';

export interface DeleteProgressPhotoDeps {
  photos: ProgressPhotoRepository;
  /** Null when private media is not configured. Deleting still works: the removal is queued and runs once it is. */
  media: PrivateMedia | null;
}

export interface DeleteProgressPhotoResult extends Pick<
  ProgressPhotoGallery,
  'count' | 'limit' | 'nearLimit'
> {
  id: string;
  deleted: true;
}

/**
 * Deletes one of the member's own photos for good. The row is deleted in one statement scoped to (id, actor), and the
 * database queues the picture and its thumbnail for removal from the private bucket in that same statement (trigger,
 * migration 0027); the worker then deletes them, retrying until storage accepts. Someone else's photo id is a 404.
 */
export class DeleteProgressPhotoUseCase {
  constructor(private readonly deps: DeleteProgressPhotoDeps) {}

  async execute(actor: Actor, id: string): Promise<DeleteProgressPhotoResult> {
    const { photos, media } = this.deps;
    const deleted = await photos.delete(actor.userId, id);
    if (!deleted) throw notFound('PHOTO_NOT_FOUND', 'That photo was not found.');
    media?.purger.kick();
    return { id, deleted: true, ...galleryCounts(await photos.count(actor.userId)) };
  }
}
