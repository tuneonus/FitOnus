import {
  Easing,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  type EntryOrExitLayoutType,
} from 'react-native-reanimated';
import { motion, staggerDelay } from './motion';

/**
 * Reanimated side of the motion language in `motion.ts`: the easing object and the entering/exiting presets, so no
 * component hand-rolls its own curve or timing. Everything here only moves transform and opacity, which Reanimated
 * runs on the UI thread without a layout pass.
 */

/** The app's standard ease-out (Magic Patterns curve). */
export const motionEase = Easing.bezier(motion.ease[0], motion.ease[1], motion.ease[2], motion.ease[3]);

/** An element appears: fades in while rising `motion.rise` px. `index` staggers siblings (limited to eight). */
export function riseIn(index = 0, delayMs = 0) {
  return FadeInDown.delay(staggerDelay(index, delayMs))
    .duration(motion.duration.base)
    .easing(motionEase)
    .withInitialValues({ opacity: 0, transform: [{ translateY: motion.rise }] });
}

/** An element leaves: a quick fade. */
export function fadeOutQuick() {
  return FadeOut.duration(motion.duration.exit);
}

/** How far above its resting place a toast starts (px). */
const TOAST_DROP = 24;

/** Toast arrives from above on the default spring (docs/05-design-system.txt section 7.8). */
export function dropIn() {
  const { damping, stiffness, mass } = motion.spring.default;
  return FadeInUp.springify()
    .damping(damping)
    .stiffness(stiffness)
    .mass(mass)
    .withInitialValues({ opacity: 0, transform: [{ translateY: -TOAST_DROP }] });
}

/** Toast leaves upward with a timed fade (same section). */
export function liftOut() {
  return FadeOutUp.duration(motion.duration.exit);
}

export type LayoutMotion = {
  entering?: EntryOrExitLayoutType;
  exiting?: EntryOrExitLayoutType;
};

/**
 * Entering/exiting props for an Animated view, or none when the member asked for reduced motion: the element still
 * appears and disappears, it just does not travel or fade.
 */
export function layoutMotion(reduceMotion: boolean, animations: LayoutMotion): LayoutMotion {
  return reduceMotion ? {} : animations;
}
