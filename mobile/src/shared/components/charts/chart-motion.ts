/**
 * Pure helpers for the chart entrance animations (no react-native import, so node tests them).
 */

export type ChartPoint2D = { x: number; y: number };

/** A bar starts growing this much later than the one before it. */
const BAR_STEP_MS = 25;
/** However many bars there are, the last one starts no later than this. */
const BAR_MAX_DELAY_MS = 300;

/** Length of a straight-segment line, the way the renderer will measure it. */
export function polylineLength(points: readonly ChartPoint2D[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current) length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

/**
 * Dash length for drawing a line on with stroke-dashoffset. A hair longer than the line, so a finished line (offset 0)
 * is one unbroken dash with no gap at its far end; the path coordinates are rounded to a tenth of a pixel when written,
 * which can make the true length differ slightly from the one measured here.
 */
export function dashLengthFor(length: number): number {
  return length > 0 ? length + 1 : 0;
}

/** Start delay of the nth bar when a bar chart grows in. */
export function barGrowDelay(index: number): number {
  const position = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return Math.min(position * BAR_STEP_MS, BAR_MAX_DELAY_MS);
}
