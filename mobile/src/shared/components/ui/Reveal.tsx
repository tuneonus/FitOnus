import React, { useMemo } from 'react';
import Animated from 'react-native-reanimated';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { fadeOutQuick, layoutMotion, riseIn } from '@/shared/theme/motion-animations';

export type RevealProps = Omit<
  React.ComponentProps<typeof Animated.View>,
  'entering' | 'exiting' | 'layout'
> & {
  /** Position among staggered siblings (0 = first). Siblings after the eighth share the eighth's delay. */
  index?: number | undefined;
  /** Extra delay before the entrance starts. */
  delayMs?: number | undefined;
  /** Also fade out when it is removed from the screen. */
  exit?: boolean | undefined;
};

/**
 * A View that fades in while rising a few pixels when it first appears. It takes the same props and style as a View, so
 * swapping it in for a View changes no layout. With reduced motion on it just appears.
 */
export function Reveal({ index = 0, delayMs = 0, exit = false, children, ...viewProps }: RevealProps) {
  const reduceMotion = useReduceMotion();
  const motionProps = useMemo(
    () =>
      layoutMotion(reduceMotion, {
        entering: riseIn(index, delayMs),
        ...(exit ? { exiting: fadeOutQuick() } : {}),
      }),
    [reduceMotion, index, delayMs, exit],
  );

  return (
    <Animated.View {...viewProps} {...motionProps}>
      {children}
    </Animated.View>
  );
}
