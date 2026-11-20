/**
 * The day a photo was taken, from the camera's EXIF date (`2026:11:18 08:30:00`), as `YYYY-MM-DD`. Null when there is none
 * or it is not a plausible date. Only used to suggest a date: the server removes EXIF from what it stores.
 */
export function dayFromExifDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T]|$)/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const real = new Date(Date.UTC(year, month - 1, day));
  const valid = real.getUTCFullYear() === year && real.getUTCMonth() === month - 1 && real.getUTCDate() === day;
  return valid && year >= 2000 ? `${match[1]}-${match[2]}-${match[3]}` : null;
}
