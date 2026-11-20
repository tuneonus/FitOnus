import { AppError } from '../errors/app-error.js';
import { ImageRejectedError } from '../images/image-errors.js';
import {
  HEIC_MAX_PIXELS,
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_PIXELS,
  IMAGE_UPLOAD_MAX_BYTES,
  isAcceptedUploadContentType,
} from '../images/image-policy.js';
import type { ImageLogger } from '../images/public-image-check.js';
import { mediaTypeOf } from '../images/public-image-upload.js';
import type { PrivateObjectStore } from '../storage/private-object-store.js';
import type { PrivateMediaDeletionQueue } from './deletion-queue.js';
import {
  PRIVATE_IMAGE_CACHE_CONTROL,
  imageVersionOf,
  newPrivateImageKey,
  privateObjectKeysOf,
  privateThumbnailKey,
  type PrivateImageKind,
} from './private-image-policy.js';
import type { PrivateImageProcessor } from './private-image-processor.js';

export interface PrivateImageUploadInput {
  /** The raw Content-Type header. */
  contentType: string | undefined;
  /** Content-Length when the client declared one. */
  declaredLength: number | null;
  /** Reads the request body. Called only after every check that does not need the bytes has passed. */
  readBody: () => Promise<Uint8Array>;
}

/** A picture that has been written to the private bucket and is not referenced by any record yet. */
export interface StoredPrivateImage {
  key: string;
  thumbnailKey: string;
  /** Changes on every upload: the clients' cache key. */
  version: string;
  width: number;
  height: number;
  byteSize: number;
  source: { format: string; bytes: number; width: number; height: number };
}

export interface PrivateImageUploaderDeps {
  /** Null when private media is not configured: uploads then answer 503. */
  store: PrivateObjectStore | null;
  processor: PrivateImageProcessor | null;
  deletionQueue: PrivateMediaDeletionQueue | null;
  logger?: ImageLogger | undefined;
}

const MAX_MB = IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024);
const MEGAPIXELS = (pixels: number): number => pixels / 1_000_000;

const tooLarge = (): AppError =>
  new AppError(
    'payload_too_large',
    'PAYLOAD_TOO_LARGE',
    `That photo is larger than ${MAX_MB} MB. Choose a smaller one.`,
  );

const invalid = (message: string): AppError => new AppError('unprocessable', 'INVALID_IMAGE', message);

export const privateStorageNotConfigured = (): AppError =>
  new AppError(
    'unavailable',
    'PRIVATE_STORAGE_NOT_CONFIGURED',
    'Photo storage is not available on this server right now.',
  );

export const privateStorageUnavailable = (): AppError =>
  new AppError(
    'unavailable',
    'PRIVATE_STORAGE_UNAVAILABLE',
    'The photo could not be saved or loaded right now. Try again in a moment.',
  );

/** What to tell the member when the content (not the declared type) cannot be accepted. */
export function memberImageMessage(error: ImageRejectedError): AppError {
  switch (error.reason) {
    case 'empty':
      return invalid('The photo file is empty.');
    case 'too_large':
      return tooLarge();
    case 'unsupported_format':
      return invalid('Use a JPEG, PNG, WebP or HEIC photo.');
    case 'dimensions':
      return invalid(
        `That photo is too large in pixels. Use one up to ${IMAGE_MAX_DIMENSION} px on each side and ` +
          `${MEGAPIXELS(IMAGE_MAX_PIXELS)} megapixels (HEIC: ${MEGAPIXELS(HEIC_MAX_PIXELS)} megapixels).`,
      );
    case 'animated':
      return invalid('Animated images are not supported. Choose a still photo.');
    case 'heic_disabled':
      return new AppError(
        'unsupported_media_type',
        'UNSUPPORTED_MEDIA_TYPE',
        'HEIC photos are not enabled on this server. Use a JPEG, PNG or WebP photo.',
      );
    case 'corrupt':
      return invalid('That photo looks damaged or incomplete. Try another one.');
  }
}

/**
 * Validates, converts and stores one member's photo in the PRIVATE bucket and returns the keys it was stored under.
 * It stores only; attaching the keys to a record (and what that replaces) is the caller's business, inside one
 * database transaction.
 *
 * - the declared type only decides whether the body is read at all; the bytes are then decoded, validated and
 *   re-encoded by the shared pipeline (no EXIF, no GPS), then cropped/resized for the kind;
 * - the name is chosen here from the OWNER's id and 128 random bits: a client cannot choose a name, overwrite an
 *   object, write under someone else's id or write anywhere else;
 * - the thumbnail is written first and the picture last, so a failure part way never leaves a key a record could
 *   store that is missing a file it needs; what was written is removed again (or queued for removal);
 * - the response never says why storage failed.
 */
export class PrivateImageUploader {
  constructor(private readonly deps: PrivateImageUploaderDeps) {}

  async upload(
    ownerId: string,
    kind: PrivateImageKind,
    input: PrivateImageUploadInput,
  ): Promise<StoredPrivateImage> {
    const { store, processor } = this.deps;
    if (!store || !processor) throw privateStorageNotConfigured();

    // Cheap refusals first: none of these read the body.
    if (!isAcceptedUploadContentType(mediaTypeOf(input.contentType))) {
      throw new AppError(
        'unsupported_media_type',
        'UNSUPPORTED_MEDIA_TYPE',
        'Only JPEG, PNG, WebP and HEIC photos can be uploaded (send Content-Type: image/jpeg, image/png, image/webp or image/heic).',
      );
    }
    if (input.declaredLength !== null && input.declaredLength > IMAGE_UPLOAD_MAX_BYTES) throw tooLarge();

    const bytes = await input.readBody();
    if (bytes.byteLength === 0) throw invalid('The photo file is empty.');
    // The reader enforces this while streaming; checked again because a client may omit or understate Content-Length.
    if (bytes.byteLength > IMAGE_UPLOAD_MAX_BYTES) throw tooLarge();

    let processed;
    try {
      processed = await processor.process(bytes, kind);
    } catch (error) {
      if (error instanceof ImageRejectedError) throw memberImageMessage(error);
      throw error;
    }

    const key = newPrivateImageKey(ownerId, kind);
    const thumbnailKey = privateThumbnailKey(key);
    const stored: StoredPrivateImage = {
      key,
      thumbnailKey,
      version: imageVersionOf(key),
      width: processed.canonical.width,
      height: processed.canonical.height,
      byteSize: processed.canonical.body.byteLength,
      source: processed.source,
    };

    try {
      await store.put({
        key: thumbnailKey,
        body: processed.thumbnail.body,
        contentType: processed.thumbnail.contentType,
        cacheControl: PRIVATE_IMAGE_CACHE_CONTROL,
      });
      await store.put({
        key,
        body: processed.canonical.body,
        contentType: processed.canonical.contentType,
        cacheControl: PRIVATE_IMAGE_CACHE_CONTROL,
      });
    } catch (error) {
      // The error carries the operation and HTTP status only (never credentials, URLs or response bodies).
      this.deps.logger?.warn({ err: error, kind }, 'Private photo upload to storage failed');
      await this.discard(stored);
      throw privateStorageUnavailable();
    }
    return stored;
  }

  /**
   * Removes a picture that was written but will not be referenced (the record could not be saved). Best effort and
   * never throws: whatever cannot be deleted now is handed to the deletion queue. If the queue cannot take it either
   * (storage and the database both failing at the same moment), the object stays in the private bucket: no row
   * points at it, so it is never shown to anyone, and it is the one remaining way private storage can leak a file
   * (see "Known gap" in docs/private-media.md).
   */
  async discard(stored: Pick<StoredPrivateImage, 'key'>): Promise<void> {
    const { store, deletionQueue, logger } = this.deps;
    if (!store) return;
    const failed: string[] = [];
    for (const key of privateObjectKeysOf(stored.key)) {
      try {
        await store.delete(key);
      } catch {
        failed.push(key);
      }
    }
    if (failed.length === 0) return;
    try {
      await deletionQueue?.enqueue(failed);
    } catch (error) {
      logger?.warn(
        { err: error, objects: failed.length },
        'Could not queue an unreferenced private photo for deletion',
      );
    }
  }
}
