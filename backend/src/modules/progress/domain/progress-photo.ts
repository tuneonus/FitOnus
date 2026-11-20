/**
 * Progress photos: pictures a member takes of their own body to see change over time. Always private.
 *
 * The rules here are the product rules (docs: 16-progress-analytics.txt, section 7.3): at most 50 photos per member,
 * an optional body-view tag, the date the photo was taken. They are kept in this one place so the use cases, the
 * request validation and the tests cannot disagree.
 */

/** The most photos one member may keep. The database enforces the same number (migration 0027); a test pins both. */
export const PROGRESS_PHOTO_LIMIT = 50;
/** From this many photos on, responses say `nearLimit` so the app can warn before the limit is hit. */
export const PROGRESS_PHOTO_NEAR_LIMIT_AT = 45;

export const PROGRESS_PHOTO_TAGS = ['front', 'side', 'back', 'other'] as const;
export type ProgressPhotoTag = (typeof PROGRESS_PHOTO_TAGS)[number];

/** A stored progress photo. `objectKey` is a key in the PRIVATE bucket, never a URL. */
export interface ProgressPhotoRecord {
  id: string;
  userId: string;
  objectKey: string;
  /** The member's own calendar day, `YYYY-MM-DD`. */
  takenOn: string;
  tag: ProgressPhotoTag | null;
  width: number;
  height: number;
  byteSize: number;
  createdAt: Date;
}

export interface NewProgressPhoto {
  objectKey: string;
  takenOn: string;
  tag: ProgressPhotoTag | null;
  width: number;
  height: number;
  byteSize: number;
}

/** The member already holds the maximum number of photos. */
export class ProgressPhotoLimitReachedError extends Error {
  override readonly name = 'ProgressPhotoLimitReachedError';
  constructor() {
    super(`A member can keep at most ${PROGRESS_PHOTO_LIMIT} progress photos`);
  }
}

export const isNearPhotoLimit = (count: number): boolean => count >= PROGRESS_PHOTO_NEAR_LIMIT_AT;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written `YYYY-MM-DD` (rejects 2026-02-30 and the like). */
export function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The earliest day a photo may be dated (the database CHECK is the same). */
export const EARLIEST_PHOTO_DAY = '2000-01-01';

/**
 * The latest day a photo may be dated. A member's own calendar day can be up to a day ahead of UTC (UTC+14), so the
 * limit is tomorrow in UTC: tight enough to refuse a mistyped year, loose enough never to refuse a real "today".
 */
export function latestPhotoDay(now: Date): string {
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.toISOString().slice(0, 10);
}

/** The day to use when the app sends none: today in UTC. */
export const defaultPhotoDay = (now: Date): string => now.toISOString().slice(0, 10);
