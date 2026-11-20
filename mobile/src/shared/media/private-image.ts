/**
 * Rules for showing a member's PRIVATE pictures (avatar, progress photos).
 *
 * The backend answers with short-lived signed URLs, not permanent addresses. Three things follow, and this file is
 * the one place they are decided (pure, so they are tested without a phone):
 *
 * 1. A URL is only good until `expiresAt`: ask again shortly before that, and once if a picture fails to load.
 * 2. The image cache must NOT be keyed by the URL (it changes every request, so nothing would ever be reused) and must
 *    NOT be keyed by the id alone (a replaced picture keeps its id, so the old picture would stay on screen). It is
 *    keyed by id AND `version`: the backend changes `version` on every replacement, so a new picture always misses the
 *    cache while an unchanged one is reused across URL refreshes.
 * 3. The URLs are credentials: they live in memory (the query cache) only, are never persisted, and the on-device image
 *    cache is cleared when the member signs out.
 */

export type PrivateImageKind = 'avatar' | 'progress';
export type PrivateImageVariant = 'full' | 'thumb';

/** Refresh this long before the URL actually expires, so a screen left open never shows a broken picture. */
export const REFRESH_LEAD_MS = 60_000;

/** The least a scheduled refresh waits, so a very short lifetime cannot turn into a request loop. */
export const MIN_REFRESH_DELAY_MS = 5_000;

export function privateImageCacheKey(
  kind: PrivateImageKind,
  id: string,
  version: string,
  variant: PrivateImageVariant,
): string {
  return `private:${kind}:${id}:${version}:${variant}`;
}

const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
};

/** True when the URLs are expired or about to be (within `leadMs`), or when no expiry is known. */
export function isUrlStale(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
  leadMs: number = REFRESH_LEAD_MS,
): boolean {
  const expiry = parse(expiresAt);
  return expiry === null || expiry - leadMs <= now;
}

/**
 * How long to wait before asking for fresh URLs, or `false` when there is nothing to refresh (no picture). For
 * react-query's `refetchInterval`.
 */
export function refreshDelayMs(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
  leadMs: number = REFRESH_LEAD_MS,
): number | false {
  const expiry = parse(expiresAt);
  if (expiry === null) return false;
  return Math.max(MIN_REFRESH_DELAY_MS, expiry - leadMs - now);
}

/** The soonest expiry among several photos (the whole gallery is refreshed together), or null when there are none. */
export function earliestExpiry(expiries: readonly (string | null | undefined)[]): string | null {
  let best: { iso: string; time: number } | null = null;
  for (const iso of expiries) {
    const time = parse(iso);
    if (iso && time !== null && (best === null || time < best.time)) best = { iso, time };
  }
  return best?.iso ?? null;
}

/** The part of the sign-in state that decides whether on-device private pictures may stay. */
export interface SessionSnapshot {
  userId: string | null;
  isAuthenticated: boolean;
  /** True until the saved session has been read at app start. */
  isLoading: boolean;
}

/**
 * Whether the on-device copy of private pictures must be emptied when the sign-in state changes from `previous` to
 * `next`: when a member signs out (or is signed out), when a different account takes over, and when the app has just
 * started and found nobody signed in (what an earlier run left on disk, for instance a sign-out the system interrupted,
 * belongs to nobody now). Restoring the saved session of the same member at app start keeps the cache: that is the
 * member's own pictures, shown again without downloading them.
 */
export function shouldClearPrivateImages(previous: SessionSnapshot, next: SessionSnapshot): boolean {
  if (previous.userId !== null && next.userId !== previous.userId) return true;
  if (previous.isAuthenticated && !next.isAuthenticated) return true;
  return previous.isLoading && !next.isLoading && !next.isAuthenticated;
}
