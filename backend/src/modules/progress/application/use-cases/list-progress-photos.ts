import type { Actor } from '../../../../shared/auth/actor.js';
import type { ImageLogger } from '../../../../shared/images/public-image-check.js';
import { privateStorageNotConfigured, type PrivateMedia } from '../../../../shared/private-media/index.js';
import type { ProgressPhotoRepository } from '../photo-ports.js';
import {
  galleryCounts,
  toListItem,
  type ProgressPhotoGallery,
  type ProgressPhotoListItem,
} from '../photo-view.js';

export interface ListProgressPhotosDeps {
  photos: ProgressPhotoRepository;
  media: PrivateMedia | null;
  logger?: ImageLogger | undefined;
}

/**
 * The signed-in member's gallery, newest day first, as thumbnails with short-lived signed URLs. There are at most 50, so
 * no paging. The request names no member: only the actor's own rows can be read.
 */
export class ListProgressPhotosUseCase {
  constructor(private readonly deps: ListProgressPhotosDeps) {}

  async execute(actor: Actor): Promise<ProgressPhotoGallery> {
    const { photos, media, logger } = this.deps;
    if (!media) throw privateStorageNotConfigured();
    const records = await photos.list(actor.userId);
    const items: ProgressPhotoListItem[] = [];
    for (const record of records) {
      const item = toListItem(record, media.urls);
      if (item) items.push(item);
      else
        logger?.warn(
          { kind: 'progress' },
          "A stored progress photo key is not the owner's own; leaving it out",
        );
    }
    return { photos: items, ...galleryCounts(records.length) };
  }
}
