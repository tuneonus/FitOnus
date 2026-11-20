import {
  PROGRESS_PHOTO_LIMIT,
  isNearPhotoLimit,
  type ProgressPhotoRecord,
  type ProgressPhotoTag,
} from '../domain/progress-photo.js';
import type { PrivateImageUrlIssuer } from '../../../shared/private-media/private-image-urls.js';

/** A photo in the gallery: the thumbnail only. The full-size picture is a separate, on-demand request. */
export interface ProgressPhotoListItem {
  id: string;
  takenOn: string;
  tag: ProgressPhotoTag | null;
  width: number;
  height: number;
  createdAt: string;
  /** Changes if the stored picture ever changes: part of the client's image-cache key. */
  version: string;
  thumbnailUrl: string;
  /** ISO 8601: after this the URL stops working. */
  urlExpiresAt: string;
}

/** One photo, with the full-size picture as well. */
export interface ProgressPhotoView extends ProgressPhotoListItem {
  url: string;
}

export interface ProgressPhotoGallery {
  photos: ProgressPhotoListItem[];
  count: number;
  limit: number;
  /** True from 45 photos on, so the app can warn before the limit. */
  nearLimit: boolean;
}

export interface ProgressPhotoUploadResult {
  photo: ProgressPhotoView;
  count: number;
  limit: number;
  nearLimit: boolean;
}

export const galleryCounts = (
  count: number,
): Pick<ProgressPhotoGallery, 'count' | 'limit' | 'nearLimit'> => ({
  count,
  limit: PROGRESS_PHOTO_LIMIT,
  nearLimit: isNearPhotoLimit(count),
});

const base = (record: ProgressPhotoRecord) => ({
  id: record.id,
  takenOn: record.takenOn,
  tag: record.tag,
  width: record.width,
  height: record.height,
  createdAt: record.createdAt.toISOString(),
});

/** Null when the stored key is not this member's own progress key (a corrupt or foreign row shows nothing). */
export function toPhotoView(
  record: ProgressPhotoRecord,
  urls: PrivateImageUrlIssuer,
): ProgressPhotoView | null {
  const signed = urls.issue(record.userId, 'progress', record.objectKey);
  if (!signed) return null;
  return {
    ...base(record),
    version: signed.version,
    thumbnailUrl: signed.thumbnailUrl,
    urlExpiresAt: signed.expiresAt,
    url: signed.url,
  };
}

/** The gallery form: thumbnail only (least capability: a list needs no full-size URLs). Null like `toPhotoView`. */
export function toListItem(
  record: ProgressPhotoRecord,
  urls: PrivateImageUrlIssuer,
): ProgressPhotoListItem | null {
  const signed = urls.issueThumbnail(record.userId, 'progress', record.objectKey);
  if (!signed) return null;
  return {
    ...base(record),
    version: signed.version,
    thumbnailUrl: signed.thumbnailUrl,
    urlExpiresAt: signed.expiresAt,
  };
}
