import type { UploadedImageRef } from '../media/image-upload';
import type { Exercise, WorkoutTemplate } from './types';

/**
 * Pure rules behind the exercise image fields, kept free of React so they can be tested directly.
 *
 * An exercise can have two pictures: one an admin UPLOADED (the backend stores it and the exercise keeps its key) and
 * an EXTERNAL address an admin typed. The uploaded one is shown when there is one; otherwise the external address.
 */

/** Same limit as the backend (the longest external address it accepts). */
export const EXTERNAL_URL_MAX_LENGTH = 2048;

/**
 * Whether `value` is an absolute http or https address with a host: the only kind of external address the backend
 * accepts (`javascript:`, `data:`, `file:`, `ftp:` and relative addresses are refused there).
 */
export function isHttpUrl(value: string): boolean {
  if (value.length === 0 || value.length > EXTERNAL_URL_MAX_LENGTH) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** What is wrong with an external address a person typed, or null when it is fine (or left empty). */
export function externalUrlProblem(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > EXTERNAL_URL_MAX_LENGTH) return `${label} must be at most ${EXTERNAL_URL_MAX_LENGTH} characters.`;
  return isHttpUrl(trimmed) ? null : `${label} must be a valid http or https URL.`;
}

/**
 * A warning (not an error) for an http address: it is accepted, so addresses saved earlier stay valid, but a release
 * Android build does not load cleartext images, so the picture may not show in the app. https is preferred.
 */
export function externalUrlWarning(value: string): string | null {
  return /^http:\/\//i.test(value.trim()) && isHttpUrl(value.trim())
    ? 'This address uses http. Prefer https: images served over http may not load in the app on Android.'
    : null;
}

/**
 * The external address to show in the editor's text field. The API's `imageUrl` is the picture that is DISPLAYED
 * (the uploaded one when there is one), so the field starts from `externalImageUrl`, the address that was typed. A
 * backend that predates uploads has no such field, and there `imageUrl` is the typed address.
 */
export function initialExternalImageUrl(exercise: Pick<Exercise, 'imageUrl' | 'externalImageUrl'> | null): string {
  if (!exercise) return '';
  return (exercise.externalImageUrl === undefined ? exercise.imageUrl : exercise.externalImageUrl) ?? '';
}

/** The uploaded image the editor starts with, or null. The preview URL is only trusted when it is the upload's own. */
export function initialUploadedImage(
  exercise: Pick<Exercise, 'imageKey' | 'imageUrl' | 'externalImageUrl'> | null,
): UploadedImageRef | null {
  if (!exercise?.imageKey) return null;
  // When the media domain is not configured the API falls back to the external address as "the picture"; that is not
  // a preview of the upload, so it is not used as one.
  const url = exercise.imageUrl && exercise.imageUrl !== exercise.externalImageUrl ? exercise.imageUrl : null;
  return { key: exercise.imageKey, url };
}

export type ExerciseImageSource = 'uploaded' | 'external' | 'none';

/** Which picture the app will show: the uploaded one, else the external address, else none. */
export function imageSource(uploaded: UploadedImageRef | null, externalUrl: string): ExerciseImageSource {
  if (uploaded) return 'uploaded';
  return isHttpUrl(externalUrl.trim()) ? 'external' : 'none';
}

export function imageSourceNote(source: ExerciseImageSource): string {
  switch (source) {
    case 'uploaded':
      return 'The app shows the uploaded image. The address below is used only if you remove the upload.';
    case 'external':
      return 'The app shows the image at this address. An uploaded image would take its place.';
    case 'none':
      return 'This exercise has no image yet: the app shows an icon.';
  }
}

/**
 * The cover a template editor starts with, or null. A template has only an uploaded cover (no external-address
 * fallback). When the media domain is not configured the API reports the key but no URL, and the editor then says
 * the preview is unavailable instead of showing a broken picture.
 */
export function initialTemplateCover(
  template: Pick<WorkoutTemplate, 'coverImageKey' | 'coverImageUrl'> | null,
): UploadedImageRef | null {
  if (!template?.coverImageKey) return null;
  return { key: template.coverImageKey, url: template.coverImageUrl ?? null };
}

/** What the member app does with the cover, so an admin knows what saving (or removing) it will change. */
export function coverNote(cover: UploadedImageRef | null): string {
  return cover
    ? 'Members see this cover on the routine card and at the top of the routine. Removing it brings back the plain card.'
    : 'No cover: members see the plain routine card, exactly as before.';
}
