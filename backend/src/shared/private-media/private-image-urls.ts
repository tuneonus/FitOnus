import type { PrivateObjectStore } from '../storage/private-object-store.js';
import {
  imageVersionOf,
  isOwnedPrivateImageKey,
  privateThumbnailKey,
  type PrivateImageKind,
} from './private-image-policy.js';

export interface SignedImageUrls {
  /** What identifies this stored picture and changes whenever it is replaced: use it in the client's cache key. */
  version: string;
  /** The picture. A GET-only URL, valid until `expiresAt`. */
  url: string;
  thumbnailUrl: string;
  /** ISO 8601. Past this instant the URLs stop working and fresh ones must be requested. */
  expiresAt: string;
}

export interface SignedThumbnailUrl {
  version: string;
  thumbnailUrl: string;
  expiresAt: string;
}

/**
 * The ONLY place a private picture's URL is made. It refuses a key that is not the canonical key of this kind that
 * belongs to this owner, so no code path can sign someone else's picture (or a thumbnail, or a public object) by
 * passing the wrong value: whoever calls it must have the owner's id from the authenticated session and the key from a
 * row it read for that owner, and both are checked against each other again here.
 *
 * URLs are short-lived (PRIVATE_MEDIA_URL_TTL_SECONDS, default 15 minutes) and GET-only. They are credentials: never
 * logged, never stored, never cached by a client beyond their lifetime.
 */
export class PrivateImageUrlIssuer {
  constructor(
    private readonly store: PrivateObjectStore,
    private readonly ttlSeconds: number,
  ) {}

  /**
   * Only the thumbnail's URL, for a list: a list does not need (and so is not given) the means to fetch every
   * full-size picture. Null under the same conditions as `issue`.
   */
  issueThumbnail(ownerId: string, kind: PrivateImageKind, key: string): SignedThumbnailUrl | null {
    if (!isOwnedPrivateImageKey(key, ownerId, kind)) return null;
    const thumbnail = this.store.presignGet(privateThumbnailKey(key), { expiresInSeconds: this.ttlSeconds });
    return {
      version: imageVersionOf(key),
      thumbnailUrl: thumbnail.url,
      expiresAt: thumbnail.expiresAt.toISOString(),
    };
  }

  /** Null when the key is not this owner's canonical key of this kind (a corrupt or foreign row shows nothing). */
  issue(ownerId: string, kind: PrivateImageKind, key: string): SignedImageUrls | null {
    if (!isOwnedPrivateImageKey(key, ownerId, kind)) return null;
    const image = this.store.presignGet(key, { expiresInSeconds: this.ttlSeconds });
    const thumbnail = this.store.presignGet(privateThumbnailKey(key), { expiresInSeconds: this.ttlSeconds });
    const expiresAt = image.expiresAt < thumbnail.expiresAt ? image.expiresAt : thumbnail.expiresAt;
    return {
      version: imageVersionOf(key),
      url: image.url,
      thumbnailUrl: thumbnail.url,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
