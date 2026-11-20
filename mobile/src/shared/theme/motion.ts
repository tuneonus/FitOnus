import { premium } from './premium';

/**
 * OnusFit motion language: the one place durations, curves, springs and distances are decided.
 *
 * Where the numbers come from (none are invented here):
 * - `press` and `settle` are `premium.motion`, which ActionButton already uses.
 * - `ease` and `base` follow the Magic Patterns reference (`motionTokens`: ease [0.23, 1, 0.32, 1], base 0.22 s).
 * - The four springs, the 50 ms stagger and its 8-item limit are docs/05-design-system.txt section 7.6.
 *
 * Deliberate differences from that document: charts and count-ups take 600 ms (its 800 ms "ceremonial" is longer than a
 * dashboard needs, and the count-up is capped at 600 ms by decision), and entrances travel 8 px instead of 20 px so
 * they stay subtle.
 *
 * This file is plain data and pure functions with no react-native import, so node can unit-test it. The Reanimated
 * wrappers (easing object, entering/exiting presets) live in `motion-animations.ts`. Functions marked 'worklet' are
 * called from the UI thread.
 */
export const motion = {
  duration: {
    /** Finger down. */
    press: premium.motion.press,
    /** Finger up, small colour or state changes. */
    settle: premium.motion.settle,
    /** Something appears. */
    base: 220,
    /** Something leaves: quicker than it arrived, so the interface never seems to wait. */
    exit: 150,
    /** A bar or gauge following its data. */
    fill: 400,
    /** First paint of a chart: ring sweep, line draw, bars growing. */
    chart: 600,
    /** A summary number counting up. Hard limit: 600 ms. */
    countUp: 600,
  },
  /** Cubic-bezier control points of the app's standard ease-out. */
  ease: [0.23, 1, 0.32, 1] as const,
  spring: {
    default: { damping: 15, stiffness: 150, mass: 1 },
    snappy: { damping: 20, stiffness: 300, mass: 0.8 },
    gentle: { damping: 20, stiffness: 100, mass: 1 },
    bouncy: { damping: 10, stiffness: 150, mass: 0.8 },
  },
  /** Pressed state of a button: the values Button has always had, now eased instead of snapped. */
  press: { scale: 0.98, opacity: 0.86 },
  /** How far (px) an appearing element travels. */
  rise: 8,
  stagger: { stepMs: 50, maxItems: 8 },
} as const;

/** Clamps to 0..1; anything that is not a number becomes 0. */
export function clamp01(value: number): number {
  'worklet';
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Delay for the nth sibling of a staggered entrance. Items after the eighth share the eighth's delay, so a long list
 * never makes the last rows wait.
 */
export function staggerDelay(index: number, baseMs = 0): number {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const position = Math.min(safeIndex, motion.stagger.maxItems - 1);
  return Math.max(0, baseMs) + position * motion.stagger.stepMs;
}

/** How many decimals a number needs (at most `max`), so a count-up shows the same precision as its end value. */
export function decimalPlaces(value: number, max = 3): number {
  if (!Number.isFinite(value)) return 0;
  for (let places = 0; places < max; places += 1) {
    const scale = 10 ** places;
    if (Math.abs(Math.round(value * scale) / scale - value) < 1e-9) return places;
  }
  return max;
}

/** Rounds to a number of decimals. */
export function roundToPlaces(value: number, places: number): number {
  'worklet';
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/**
 * The number to show while counting up toward `target`. Climbs from 0 at the target's own precision and lands on
 * `target` exactly, so the final text is identical to what was shown before the animation existed.
 */
export function countUpValue(target: number, progress: number, places: number): number {
  'worklet';
  const amount = clamp01(progress);
  if (amount >= 1) return target;
  return roundToPlaces(target * amount, places);
}

/**
 * Horizontal offset of a full-width fill inside a clipped track so that it shows `progress` of the track.
 * Moving a view with a transform is cheaper than animating its width, which would re-run layout every frame.
 */
export function progressOffset(progress: number, trackWidth: number): number {
  'worklet';
  return (clamp01(progress) - 1) * Math.max(0, trackWidth);
}

/** stroke-dashoffset that leaves `progress` of a full-circle ring drawn. */
export function ringDashOffset(circumference: number, progress: number): number {
  'worklet';
  return circumference * (1 - clamp01(progress));
}
