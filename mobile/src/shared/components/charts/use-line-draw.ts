import { useAnimatedProps } from 'react-native-reanimated';
import { useTween } from '@/hooks/use-tween';
import { clamp01, motion, ringDashOffset } from '@/shared/theme/motion';
import { dashLengthFor } from './chart-motion';

/** The line is drawn by the time this share of the animation has passed; what rides on it (dots) fades in after. */
const LATE_FADE_FROM = 0.4;

/**
 * Draws a chart line on from its start, then fades in whatever should follow it (data dots, a projection).
 *
 * Give the Path `strokeDasharray={dash}` and `animatedProps={lineProps}`; give the dots `animatedProps={lateFadeProps}`.
 * `drawKey` identifies the data: the line draws again when it changes and stays put when the chart merely re-renders.
 * With reduced motion the line is simply drawn, as it always was.
 */
export function useLineDraw(drawKey: string, length: number) {
  const progress = useTween(1, {
    durationMs: motion.duration.chart,
    fromZero: true,
    restartKey: drawKey,
  });
  const dash = dashLengthFor(length);
  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: ringDashOffset(dash, progress.get()),
  }));
  const lateFadeProps = useAnimatedProps(() => ({
    opacity: clamp01((progress.get() - LATE_FADE_FROM) / (1 - LATE_FADE_FROM)),
  }));
  return { dash, lineProps, lateFadeProps };
}
