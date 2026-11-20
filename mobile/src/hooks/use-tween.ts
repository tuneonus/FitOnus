import { useEffect, useRef } from 'react';
import { Easing, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { motion } from '@/shared/theme/motion';
import { motionEase } from '@/shared/theme/motion-animations';
import { useReduceMotion } from './use-reduce-motion';

export type TweenOptions = {
  /** Length of one tween. Defaults to `motion.duration.fill`. */
  durationMs?: number | undefined;
  /** Constant speed instead of the standard ease-out (a timer bar that must drain evenly). */
  linear?: boolean | undefined;
  /** Start at 0 on first render and grow to the target, instead of showing the target straight away. */
  fromZero?: boolean | undefined;
  /** Replay from 0 whenever this changes (for example a chart's data). */
  restartKey?: string | number | undefined;
  /** Wait before starting. */
  delayMs?: number | undefined;
};

/**
 * A shared value that follows `target` with the app's standard timing. Gauges, rings, chart draws and count-ups all
 * need exactly this, so they share it. With reduced motion on it simply is the target.
 *
 * The value is the animated number itself; read it with `.get()` inside a worklet (useAnimatedStyle, useAnimatedProps).
 */
export function useTween(target: number, options: TweenOptions = {}): SharedValue<number> {
  const {
    durationMs = motion.duration.fill,
    linear = false,
    fromZero = false,
    restartKey,
    delayMs = 0,
  } = options;
  const reduceMotion = useReduceMotion();
  const value = useSharedValue(fromZero && !reduceMotion ? 0 : target);
  const previousKey = useRef(restartKey);

  useEffect(() => {
    if (reduceMotion || durationMs <= 0) {
      value.set(target);
      return;
    }
    if (previousKey.current !== restartKey) {
      previousKey.current = restartKey;
      value.set(0);
    }
    const tween = withTiming(target, {
      duration: durationMs,
      easing: linear ? Easing.linear : motionEase,
    });
    value.set(delayMs > 0 ? withDelay(delayMs, tween) : tween);
  }, [target, restartKey, reduceMotion, durationMs, linear, delayMs, value]);

  return value;
}
