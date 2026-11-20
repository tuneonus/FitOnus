import { useEffect } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { motion } from '@/shared/theme/motion';
import { motionEase } from '@/shared/theme/motion-animations';
import { useReduceMotion } from './use-reduce-motion';

/**
 * A colour that fades to its new value instead of snapping. Returns a shared value for `useAnimatedStyle`
 * (`backgroundColor: color.get()`); it starts at `color`, so nothing animates on first render, and it changes at
 * once when the member asked for reduced motion. Because it follows whatever colour it is given, a light/dark theme
 * switch cross-fades too.
 */
export function useAnimatedColor(
  color: string,
  durationMs: number = motion.duration.settle,
): SharedValue<string> {
  const reduceMotion = useReduceMotion();
  const value = useSharedValue(color);

  useEffect(() => {
    value.set(
      reduceMotion || durationMs <= 0
        ? color
        : withTiming(color, { duration: durationMs, easing: motionEase }),
    );
  }, [color, durationMs, reduceMotion, value]);

  return value;
}
