import { AppError } from '../errors/app-error.js';
import type { PublicObjectStore } from '../storage/object-store.js';

/** The part of a logger these checks need. */
export interface ImageLogger {
  warn(data: object, message: string): void;
}

export interface ImageStorageDeps {
  store: PublicObjectStore | null;
  resolveUrl: (key: string | null) => string | null;
  logger?: ImageLogger | undefined;
}

/**
 * A key is only meaningful when storage is configured and the public media address is known. `subject` names what is
 * being saved ("a notification", "an exercise") so the message tells the admin what they tried to do.
 */
export function assertImageStorageConfigured(deps: ImageStorageDeps, key: string, subject: string): void {
  if (!deps.store || !deps.resolveUrl(key)) {
    throw new AppError(
      'unavailable',
      'IMAGE_STORAGE_NOT_CONFIGURED',
      `Image storage is not configured on this server, so ${subject} cannot include an image.`,
    );
  }
}

/**
 * Verifies that every object a saved image needs really exists in storage, and stops at the first that does not.
 * A missing object is `422 IMAGE_NOT_FOUND` (nothing is saved); storage that cannot answer is `503
 * IMAGE_STORAGE_UNAVAILABLE`, and the response never says why (the log carries the operation and HTTP status only).
 * `noun` completes "The image for this ___ could not be found".
 */
export async function assertImageObjectsExist(
  deps: ImageStorageDeps,
  objectKeys: readonly string[],
  noun: string,
): Promise<void> {
  const store = deps.store;
  if (!store) {
    throw new AppError(
      'unavailable',
      'IMAGE_STORAGE_NOT_CONFIGURED',
      `Image storage is not configured on this server, so the ${noun} image cannot be checked.`,
    );
  }
  let found = true;
  try {
    for (const objectKey of objectKeys) {
      if (!(await store.exists(objectKey))) {
        found = false;
        break;
      }
    }
  } catch (error) {
    deps.logger?.warn({ err: error }, `The ${noun} image existence check failed`);
    throw new AppError(
      'unavailable',
      'IMAGE_STORAGE_UNAVAILABLE',
      `The ${noun} image could not be checked right now. Try again in a moment.`,
    );
  }
  if (!found) {
    throw new AppError(
      'unprocessable',
      'IMAGE_NOT_FOUND',
      `The image for this ${noun} could not be found. Remove it or upload it again.`,
    );
  }
}
