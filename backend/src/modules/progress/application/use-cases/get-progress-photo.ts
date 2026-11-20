import type { Actor } from '../../../../shared/auth/actor.js';
import { notFound } from '../../../../shared/errors/app-error.js';
import { privateStorageNotConfigured, type PrivateMedia } from '../../../../shared/private-media/index.js';
import type { ProgressPhotoRepository } from '../photo-ports.js';
import { toPhotoView, type ProgressPhotoView } from '../photo-view.js';

export interface GetProgressPhotoDeps {
  photos: ProgressPhotoRepository;
  media: PrivateMedia | null;
}

/**
 * One of the member's own photos with its full-size URL (the gallery only has thumbnails). Someone else's photo id is
 * answered exactly like an id that does not exist (404), so the response never reveals that another member's photo
 * is there.
 */
export class GetProgressPhotoUseCase {
  constructor(private readonly deps: GetProgressPhotoDeps) {}

  async execute(actor: Actor, id: string): Promise<ProgressPhotoView> {
    const { photos, media } = this.deps;
    if (!media) throw privateStorageNotConfigured();
    const record = await photos.find(actor.userId, id);
    const view = record ? toPhotoView(record, media.urls) : null;
    if (!view) throw notFound('PHOTO_NOT_FOUND', 'That photo was not found.');
    return view;
  }
}
