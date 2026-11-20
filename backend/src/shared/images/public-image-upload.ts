import { AppError } from '../errors/app-error.js';
import type { PublicObjectStore } from '../storage/object-store.js';
import { ImageRejectedError } from './image-errors.js';
import type { RejectedFormat } from './image-format.js';
import {
  HEIC_MAX_PIXELS,
  IMAGE_CACHE_CONTROL,
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_PIXELS,
  IMAGE_UPLOAD_MAX_BYTES,
  derivativeKey,
  isAcceptedUploadContentType,
  newImageKey,
  type PublicImageFeature,
} from './image-policy.js';
import type { ImageLogger } from './public-image-check.js';
import type { ProcessedImage } from './image-processor.js';

/** The media type of a Content-Type header, lower-cased and without parameters (`image/PNG; x=1` -> `image/png`). */
export const mediaTypeOf = (header: string | undefined): string =>
  (header ?? '').split(';')[0]!.trim().toLowerCase();

export interface PublicImageUploadInput {
  /** The raw Content-Type header. */
  contentType: string | undefined;
  /** Content-Length when the client declared one. */
  declaredLength: number | null;
  /** Reads the request body. Called only after every check that does not need the bytes has passed. */
  readBody: () => Promise<Uint8Array>;
}

/** What the upload endpoints answer with. */
export interface UploadedPublicImage {
  /** What the owning record stores. */
  imageKey: string;
  /** Public URL of the stored WebP. */
  imageUrl: string;
  contentType: 'image/webp';
  /** Size of the stored WebP. */
  sizeBytes: number;
  width: number;
  height: number;
  /** What was uploaded, before conversion. */
  source: ProcessedImage['source'];
}

export interface PublicImageUploadResult {
  image: UploadedPublicImage;
  /** The details every upload's audit entry carries: sizes and the key, never a URL or file content. */
  auditDetails: Record<string, unknown>;
}

export interface PublicImageUploaderDeps {
  /** Null when R2 is not configured: uploads then answer 503. */
  store: PublicObjectStore | null;
  /** Converts an upload (already bound to the feature's size profile). Null turns uploads off like a missing store. */
  process: ((bytes: Uint8Array) => Promise<ProcessedImage>) | null;
  resolveUrl: (key: string | null) => string | null;
  logger?: ImageLogger | undefined;
  /** Names the feature in the log line when a storage write fails ("Notification", "Exercise"). */
  label: string;
}

const MAX_MB = IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024);
const MEGAPIXELS = (pixels: number): number => pixels / 1_000_000;

const tooLarge = (): AppError =>
  new AppError('payload_too_large', 'PAYLOAD_TOO_LARGE', `The image is larger than ${MAX_MB} MB.`);

const invalid = (message: string): AppError => new AppError('unprocessable', 'INVALID_IMAGE', message);

const FORMAT_NAME: Record<RejectedFormat, string> = {
  gif: 'a GIF',
  avif: 'an AVIF',
  svg: 'an SVG',
  tiff: 'a TIFF',
  bmp: 'a BMP',
  pdf: 'a PDF',
  unknown: 'not a recognised image',
};

/** What to tell the admin when the content (not the declared type) cannot be accepted. */
function messageFor(error: ImageRejectedError): AppError {
  switch (error.reason) {
    case 'empty':
      return invalid('The file is empty.');
    case 'too_large':
      return tooLarge();
    case 'unsupported_format':
      return invalid(
        error.detected && error.detected !== 'unknown'
          ? `The file is ${FORMAT_NAME[error.detected]}. Only JPEG, PNG, WebP and HEIC images are accepted.`
          : 'The file is not a JPEG, PNG, WebP or HEIC image.',
      );
    case 'dimensions':
      return invalid(
        `The image is too large in pixels. Use one up to ${IMAGE_MAX_DIMENSION} px on each side and ` +
          `${MEGAPIXELS(IMAGE_MAX_PIXELS)} megapixels (HEIC: ${MEGAPIXELS(HEIC_MAX_PIXELS)} megapixels).`,
      );
    case 'animated':
      return invalid('Animated images are not supported. Use a still picture.');
    case 'heic_disabled':
      return new AppError(
        'unsupported_media_type',
        'UNSUPPORTED_MEDIA_TYPE',
        'HEIC images are not enabled on this server. Use a JPEG, PNG or WebP image.',
      );
    case 'corrupt':
      return invalid(
        'The image file looks damaged or incomplete, or is not a valid JPEG, PNG, WebP or HEIC image.',
      );
  }
}

/**
 * Validates, converts and stores one admin-supplied image in the public media bucket, for any feature that is allowed
 * to use it. The feature decides the folder (`onusfit/<feature>/`) and the size profile; everything else is the same:
 *
 * - the declared type only decides whether the body is read at all; the bytes are then decoded, validated and
 *   re-encoded by the shared image processor into an optimized WebP with no EXIF or other metadata;
 * - the name is 128 random bits chosen here: the client cannot choose a name, overwrite an object or write elsewhere;
 * - derivatives (a JPEG for a push) are written first and the canonical image last, so a failure part way leaves at
 *   most an unreferenced derivative, never a key a record could store that is missing a file it needs;
 * - the response never says why storage failed.
 *
 * The bucket is public: this is for admin-authored artwork only, never a member's photo. Who may call it (permission,
 * rate limit) and the audit entry are the caller's business; this class only stores.
 */
export class PublicImageUploader {
  constructor(private readonly deps: PublicImageUploaderDeps) {}

  async upload(feature: PublicImageFeature, input: PublicImageUploadInput): Promise<PublicImageUploadResult> {
    const { store, process, resolveUrl } = this.deps;
    if (!store || !process) {
      throw new AppError(
        'unavailable',
        'IMAGE_STORAGE_NOT_CONFIGURED',
        'Image storage is not configured on this server, so images cannot be uploaded.',
      );
    }

    // Cheap refusals first: none of these read the body.
    if (!isAcceptedUploadContentType(mediaTypeOf(input.contentType))) {
      throw new AppError(
        'unsupported_media_type',
        'UNSUPPORTED_MEDIA_TYPE',
        'Only JPEG, PNG, WebP and HEIC images can be uploaded (send Content-Type: image/jpeg, image/png, image/webp or image/heic).',
      );
    }
    if (input.declaredLength !== null && input.declaredLength > IMAGE_UPLOAD_MAX_BYTES) throw tooLarge();

    const bytes = await input.readBody();
    if (bytes.byteLength === 0) throw invalid('The file is empty.');
    // The reader enforces this while streaming; checked again because a client may omit or understate Content-Length.
    if (bytes.byteLength > IMAGE_UPLOAD_MAX_BYTES) throw tooLarge();

    let processed: ProcessedImage;
    try {
      processed = await process(bytes);
    } catch (error) {
      if (error instanceof ImageRejectedError) throw messageFor(error);
      throw error;
    }

    const key = newImageKey(feature);
    // Resolved before anything is written. `resolveUrl` only yields null when the media origin is missing, which
    // configuration validation rules out whenever a store exists; guard anyway so a misconfiguration is a clear 503
    // and not an object stored under a URL nobody can open.
    const imageUrl = resolveUrl(key);
    if (!imageUrl) {
      throw new AppError(
        'unavailable',
        'IMAGE_STORAGE_NOT_CONFIGURED',
        'The public media address is not configured, so the image cannot be shown.',
      );
    }

    try {
      for (const derivative of processed.derivatives) {
        await store.put({
          key: derivativeKey(key, derivative.name),
          body: derivative.body,
          contentType: derivative.contentType,
          cacheControl: IMAGE_CACHE_CONTROL,
        });
      }
      await store.put({
        key,
        body: processed.canonical.body,
        contentType: processed.canonical.contentType,
        cacheControl: IMAGE_CACHE_CONTROL,
      });
    } catch (error) {
      // The error carries the operation and HTTP status only (never credentials, URLs or response bodies).
      this.deps.logger?.warn({ err: error }, `${this.deps.label} image upload to storage failed`);
      throw new AppError(
        'unavailable',
        'IMAGE_STORAGE_UNAVAILABLE',
        'The image could not be saved right now. Try again in a moment.',
      );
    }

    return {
      image: {
        imageKey: key,
        imageUrl,
        contentType: processed.canonical.contentType,
        sizeBytes: processed.canonical.body.byteLength,
        width: processed.width,
        height: processed.height,
        source: processed.source,
      },
      auditDetails: {
        imageKey: key,
        sourceFormat: processed.source.format,
        sourceBytes: processed.source.bytes,
        sourceWidth: processed.source.width,
        sourceHeight: processed.source.height,
        storedBytes: processed.canonical.body.byteLength,
        derivativeBytes: processed.derivatives.map((d) => ({ name: d.name, bytes: d.body.byteLength })),
        width: processed.width,
        height: processed.height,
      },
    };
  }
}
