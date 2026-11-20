import React, { useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTween } from '@/hooks/use-tween';
import { countUpValue, decimalPlaces, motion } from '@/shared/theme/motion';

export type AnimatedNumberProps = Omit<TextProps, 'children'> & {
  value: number;
  /** Turns a number into its text. Must match how the number was shown before it counted up. */
  format?: ((value: number) => string) | undefined;
};

/**
 * A number that counts up from 0 to `value` in at most `motion.duration.countUp` (600 ms), then reads exactly what
 * `format(value)` always read. With reduced motion on it shows `value` straight away.
 *
 * Renders a nested Text so it sits inline inside a larger Text (a number followed by its unit) and inherits that
 * Text's style. The tween runs on the UI thread; the screen only re-renders when the visible number changes.
 */
export function AnimatedNumber({ value, format = String, ...textProps }: AnimatedNumberProps) {
  const reduceMotion = useReduceMotion();
  const places = decimalPlaces(value);
  const progress = useTween(1, {
    durationMs: motion.duration.countUp,
    fromZero: true,
    restartKey: value,
  });
  const [shown, setShown] = useState(() => (reduceMotion ? value : 0));

  useAnimatedReaction(
    () => countUpValue(value, progress.get(), places),
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setShown, next);
    },
    [value, places],
  );

  return <Text {...textProps}>{format(reduceMotion ? value : shown)}</Text>;
}
