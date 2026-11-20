/**
 * The longest cover address the app will pass to an image view. The backend builds these from its own media domain, so
 * they are short; this only stops an absurd value from reaching the native image loader.
 */
const MAX_COVER_URL_LENGTH = 2048;

/**
 * The address of a workout routine's cover picture, or null when there is nothing safe to show.
 *
 * Only system templates have a cover (an admin uploads it; the backend answers with a public https URL). Everything
 * else is "no cover": the field is absent from an older backend, null for a routine without one, and anything that is
 * not an https address is ignored (a release Android build does not load cleartext http images, and a cover is never
 * anything but https from the backend). Returning null is what keeps the card and the detail screen looking exactly as
 * they did before covers existed.
 */
export function workoutCoverUri(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const uri = value.trim();
  if (uri.length === 0 || uri.length > MAX_COVER_URL_LENGTH) return null;
  try {
    const url = new URL(uri);
    return url.protocol === 'https:' && url.hostname.length > 0 ? uri : null;
  } catch {
    return null;
  }
}
