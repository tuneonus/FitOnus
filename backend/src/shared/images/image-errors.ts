import type { RejectedFormat } from './image-format.js';

/**
 * Why an upload was refused. Callers turn these into messages for people; the library error that caused a refusal
 * (which can contain internal paths or fragments of the file) is deliberately never carried along.
 */
export type ImageRejectReason =
  /** Zero bytes. */
  | 'empty'
  /** More bytes than IMAGE_UPLOAD_MAX_BYTES. */
  | 'too_large'
  /** Not JPEG, PNG, WebP or HEIC. `detected` says what it looks like. */
  | 'unsupported_format'
  /** Looks like an accepted format but cannot be decoded: damaged, truncated, or not what its header claims. */
  | 'corrupt'
  /** Decodes, but is larger in pixels than the limits allow (or has no pixels). */
  | 'dimensions'
  /** An animated image. Only still pictures are accepted. */
  | 'animated'
  /** HEIC arrived while HEIC decoding is switched off. */
  | 'heic_disabled';

export class ImageRejectedError extends Error {
  override readonly name = 'ImageRejectedError';

  constructor(
    readonly reason: ImageRejectReason,
    readonly detected?: RejectedFormat,
  ) {
    super(`Image rejected: ${reason}${detected ? ` (${detected})` : ''}`);
  }
}
