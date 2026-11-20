import type { ProgressPhotoItem, ProgressPhotoTag } from '../types/progress-photos';

/** Used only until the server's own numbers arrive; the server's `limit` and `nearLimit` are what the screens follow. */
export const DEFAULT_PHOTO_LIMIT = 50;

export const TAG_LABELS: Record<ProgressPhotoTag, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
  other: 'Other',
};
export const TAG_ORDER: readonly ProgressPhotoTag[] = ['front', 'side', 'back', 'other'];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const parseDay = (day: string): { y: number; m: number; d: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) } : null;
};

/** `2026-11-18` -> `Nov 18, 2026`. Deterministic (no locale or time-zone surprises): a day is a day. */
export function formatTakenOn(day: string): string {
  const parts = parseDay(day);
  if (!parts || parts.m < 1 || parts.m > 12) return day;
  return `${MONTHS[parts.m - 1]!.slice(0, 3)} ${parts.d}, ${parts.y}`;
}

/** `2026-11-18` -> `November 2026`. */
export function formatMonth(day: string): string {
  const parts = parseDay(day);
  if (!parts || parts.m < 1 || parts.m > 12) return day;
  return `${MONTHS[parts.m - 1]} ${parts.y}`;
}

/** Today's date on the phone, as `YYYY-MM-DD`: the member's own calendar day, which the server stores as is. */
export function localDayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Whole days from `from` to `to` (positive when `to` is later). Calendar days, so daylight saving cannot skew it. */
export function daysBetween(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export interface PhotoMonthGroup {
  /** `YYYY-MM`. */
  key: string;
  label: string;
  photos: ProgressPhotoItem[];
}

/**
 * Groups the gallery by month. The server already sends newest day first; this keeps that order, both between months
 * and inside each, so the gallery reads as a timeline from the latest photo down.
 */
export function groupPhotosByMonth(photos: readonly ProgressPhotoItem[]): PhotoMonthGroup[] {
  const groups: PhotoMonthGroup[] = [];
  for (const photo of photos) {
    const key = photo.takenOn.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.photos.push(photo);
    else groups.push({ key, label: formatMonth(photo.takenOn), photos: [photo] });
  }
  return groups;
}

export interface LimitState {
  canAdd: boolean;
  remaining: number;
  /** A message for a banner, or null when there is nothing to say yet. */
  banner: { tone: 'warning' | 'error'; title: string; body: string } | null;
}

/** What the screen should do about the photo limit, from the server's numbers. */
export function limitState(count: number, limit: number, nearLimit: boolean): LimitState {
  const remaining = Math.max(0, limit - count);
  if (remaining === 0) {
    return {
      canAdd: false,
      remaining,
      banner: {
        tone: 'error',
        title: `Photo limit reached (${limit})`,
        body: 'Delete a photo to add a new one.',
      },
    };
  }
  if (nearLimit) {
    return {
      canAdd: true,
      remaining,
      banner: {
        tone: 'warning',
        title: `${count} of ${limit} photos used`,
        body: `You can add ${remaining} more.`,
      },
    };
  }
  return { canAdd: true, remaining, banner: null };
}

const byTimeline = (a: ProgressPhotoItem, b: ProgressPhotoItem): number =>
  a.takenOn === b.takenOn ? a.createdAt.localeCompare(b.createdAt) : a.takenOn.localeCompare(b.takenOn);

/** Puts two photos in time order: the earlier is "before", the later is "after". */
export function orderPair<T extends ProgressPhotoItem>(a: T, b: T): { before: T; after: T } {
  return byTimeline(a, b) <= 0 ? { before: a, after: b } : { before: b, after: a };
}

/**
 * The comparison to offer first: the oldest photo against the newest, preferring two with the same tag (front against
 * front is a fairer comparison than front against back). Null when there are fewer than two photos.
 */
export function defaultComparisonPair(
  photos: readonly ProgressPhotoItem[],
): { before: ProgressPhotoItem; after: ProgressPhotoItem } | null {
  if (photos.length < 2) return null;
  const sorted = [...photos].sort(byTimeline);
  const oldest = sorted[0]!;
  const newest = sorted[sorted.length - 1]!;
  if (oldest.tag !== null) {
    const sameTag = [...sorted].reverse().find((photo) => photo.id !== oldest.id && photo.tag === oldest.tag);
    if (sameTag) return { before: oldest, after: sameTag };
  }
  return { before: oldest, after: newest };
}

/** Selecting for comparison: at most two; choosing a third drops the one chosen first. Choosing a chosen one unchooses it. */
export function togglePick(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((existing) => existing !== id);
  return selected.length >= 2 ? [selected[1]!, id] : [...selected, id];
}

/** `day` moved by whole calendar days. */
export function shiftDay(day: string, days: number): string {
  const parts = parseDay(day);
  if (!parts) return day;
  const moved = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + days));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}-${String(moved.getUTCDate()).padStart(2, '0')}`;
}

/** A suggested or chosen day, kept within 2000-01-01 and `today` (the server refuses anything later than tomorrow). */
export function clampDay(day: string, today: string): string {
  if (day > today) return today;
  return day < '2000-01-01' ? '2000-01-01' : day;
}
