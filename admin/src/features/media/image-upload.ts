/**
 * Choosing and uploading an image in the admin console, for every feature that lets an admin attach one
 * (notifications, exercises). Pure rules, free of React and of the network, so they can be tested directly.
 *
 * The backend decides what is accepted: it inspects the real content and converts every upload to an optimized WebP
 * with all metadata removed. The rules here only give instant feedback for the common mistakes (wrong kind of file,
 * too big), and must match the backend's (a test compares them with the backend's own policy).
 */

/**
 * Same limit as the backend (10 MiB of uploaded file; the stored, converted copy is far smaller). The backend enforces
 * it and also limits the picture itself to 8192 px a side; this is instant feedback for the common mistake.
 */
export const IMAGE_MAX_BYTES = 10 * 1_048_576;
/** What the backend accepts. It converts every one of them to an optimized WebP and removes all metadata. */
export const IMAGE_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
/** Extensions a browser may not map to a type (HEIC is the usual case), so the file picker still offers them. */
const IMAGE_ACCEPTED_EXTENSIONS = ['.heic', '.heif'] as const;
/** Value for `<input accept>`. */
export const IMAGE_ACCEPT = [...IMAGE_ACCEPTED_TYPES, ...IMAGE_ACCEPTED_EXTENSIONS].join(',');
/** What a person is told is allowed. */
export const IMAGE_FORMATS_LABEL = 'JPEG, PNG, WebP or HEIC';

/** An uploaded image held by a form. Only `key` is ever sent to the API; `url` is for showing it. */
export interface UploadedImageRef {
  key: string;
  /** Public URL, or null when the server could not derive one (media domain not configured). */
  url: string | null;
}

/**
 * "1.5 MB" / "320 KB": what an admin expects to see next to a file. Rounds up on purpose: a file even one byte
 * over a limit must never read as equal to it ("That image is 1.0 MB. The limit is 1.0 MB." helps nobody).
 */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(Math.ceil((bytes / 1_048_576) * 10) / 10).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

/**
 * The Content-Type to upload a chosen file with, or null when it is not an accepted kind of image.
 *
 * Browsers fill `file.type` from the file extension, and many (Chrome and Firefox on Windows and Linux) know nothing
 * about HEIC, so a photo straight from an iPhone arrives with an empty type (or a generic one). Those are recognised
 * by their extension instead. A file with a known but unsupported type (a GIF, say) is never rescued by its name.
 */
export function resolveImageType(file: { type: string; name?: string }): string | null {
  if ((IMAGE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return file.type;
  if (file.type === '' || file.type === 'application/octet-stream') {
    const name = (file.name ?? '').toLowerCase();
    if (name.endsWith('.heic')) return 'image/heic';
    if (name.endsWith('.heif')) return 'image/heif';
  }
  return null;
}

/**
 * Whether a browser can draw a file of this type itself. Chrome, Firefox and Edge cannot show HEIC, so a HEIC upload
 * is previewed from the converted WebP the server stored instead of from the chosen file.
 */
export const canPreviewInBrowser = (contentType: string): boolean =>
  contentType === 'image/jpeg' || contentType === 'image/png' || contentType === 'image/webp';

/**
 * Checks a chosen file before uploading it, so the obvious mistakes are explained instantly. This is a courtesy:
 * the browser's idea of a file's type comes from its extension, and the backend inspects the real content and
 * enforces the same limits regardless.
 */
export function validateImageFile(file: { type: string; size: number; name?: string }): string | null {
  if (resolveImageType(file) === null) {
    return `Choose a ${IMAGE_FORMATS_LABEL} image.`;
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > IMAGE_MAX_BYTES) {
    return `That image is ${formatFileSize(file.size)}. The limit is ${formatFileSize(IMAGE_MAX_BYTES)}.`;
  }
  return null;
}

/** What to say when the server has no image storage, for the thing the admin was making. */
export const NOTIFICATION_UNCONFIGURED_ADVICE =
  'Image uploads are not set up on this server yet. You can still send this notification without an image.';
export const EXERCISE_UNCONFIGURED_ADVICE =
  'Image uploads are not set up on this server yet. You can still save this exercise with an image address instead.';

/**
 * Turns a failed upload into a sentence an admin can act on. Matches on the backend's stable error codes; for the
 * validation failures the server's own message is already specific ("The image is larger than 10 MB.") and is kept.
 * `unconfiguredAdvice` says what the admin can do instead when the server has no image storage.
 */
export function describeImageUploadFailure(
  error: unknown,
  unconfiguredAdvice: string = NOTIFICATION_UNCONFIGURED_ADVICE,
): string {
  const { code, message } =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; message?: unknown })
      : ({} as { code?: unknown; message?: unknown });
  switch (code) {
    case 'IMAGE_STORAGE_NOT_CONFIGURED':
      return unconfiguredAdvice;
    case 'IMAGE_STORAGE_UNAVAILABLE':
      return 'The image could not be saved right now. Try again in a moment.';
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return 'The upload did not finish. Check your connection and try again.';
    default:
      return typeof message === 'string' && message ? message : 'The image could not be uploaded.';
  }
}

export type ImageUploadOutcome = { ok: true; image: UploadedImageRef } | { ok: false; error: string };

/**
 * Validates a chosen file, uploads it, and says what happened. A failure carries no image, so the caller keeps
 * whatever image was attached before: a replacement that fails never loses the current picture. `upload` is passed
 * in (rather than imported) so this stays free of the network and can be tested directly.
 */
export async function uploadImageFile(
  file: Blob & { name?: string },
  upload: (file: Blob, contentType: string) => Promise<{ imageKey: string; imageUrl: string }>,
  unconfiguredAdvice?: string,
): Promise<ImageUploadOutcome> {
  const problem = validateImageFile(file);
  if (problem) return { ok: false, error: problem };
  // Never null here: validation above refused anything that does not resolve to an accepted type.
  const contentType = resolveImageType(file) ?? file.type;
  try {
    const uploaded = await upload(file, contentType);
    return { ok: true, image: { key: uploaded.imageKey, url: uploaded.imageUrl } };
  } catch (error) {
    return { ok: false, error: describeImageUploadFailure(error, unconfiguredAdvice) };
  }
}

/** The sentence every image field starts its hint with: what is accepted and what the server does to it. */
export const imageUploadSummary = (): string =>
  `${IMAGE_FORMATS_LABEL}, up to ${formatFileSize(IMAGE_MAX_BYTES)}. It is converted to an optimized WebP and camera and location details are removed.`;
