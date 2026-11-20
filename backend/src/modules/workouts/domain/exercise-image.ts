import { isCanonicalImageKey } from '../../../shared/images/image-policy.js';
import type { PublicImageUrlResolver } from '../../../shared/images/public-image-url.js';

/**
 * How an exercise refers to its picture. There are two sources, and an uploaded one wins:
 *
 * - `imageKey`: an image an admin uploaded. Canonical `onusfit/exercises/<32 hex>.webp`, stored as a key and never as
 *   a URL; the public URL is built from the trusted media origin.
 * - `imageUrl`: an external address an admin typed (the only source before uploads existed). Only http and https are
 *   ever accepted or shown.
 */

export const isExerciseImageKey = (value: unknown): value is string =>
  isCanonicalImageKey(value, 'exercises');

/** Longest external URL accepted (browsers and most servers cap well below this). */
export const EXTERNAL_URL_MAX_LENGTH = 2048;

/**
 * True for an absolute http or https URL with a host. Everything else (`javascript:`, `data:`, `file:`, `ftp:`, a
 * relative or protocol-relative address) is refused: a stored URL is shown in apps and in the admin console.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > EXTERNAL_URL_MAX_LENGTH) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** An external URL that is safe to show, or null (also for a row saved before the http/https rule existed). */
export const displayableExternalUrl = (value: string | null): string | null =>
  isHttpUrl(value) ? value : null;

/**
 * The image to show for an exercise: the uploaded one when there is one, otherwise the external URL. Both fall back
 * to null rather than to anything unsafe, so a bad stored value never reaches an app.
 */
export function effectiveImageUrl(
  exercise: { imageKey: string | null; imageUrl: string | null },
  resolveKeyUrl: PublicImageUrlResolver,
): string | null {
  return resolveKeyUrl(exercise.imageKey) ?? displayableExternalUrl(exercise.imageUrl);
}

/** The resolver for when media storage is not configured: an uploaded image then has no URL. */
export const NO_EXERCISE_IMAGE_URLS: PublicImageUrlResolver = () => null;
