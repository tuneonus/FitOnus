import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Pause, Play } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useAnimatedColor } from '@/hooks/use-animated-color';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTween } from '@/hooks/use-tween';
import { motion } from '@/shared/theme/motion';
import { motionEase } from '@/shared/theme/motion-animations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The pause button dimmed to this while a finger is on it: what it did before (activeOpacity 0.7), now eased. */
const PRESSED_OPACITY = 0.7;
const PRESSED_SCALE = 0.96;

type PauseButtonProps = {
  paused: boolean;
  onPress: () => void;
  /** Size, radius and centring of the circle, supplied by the screen so the layout is exactly the one it had. */
  style: StyleProp<ViewStyle>;
};

/**
 * Pause / resume. The circle fades between the running and paused colours while the two icons cross-fade and
 * swell into place, instead of the button changing in a single frame.
 */
export function PauseButton({ paused, onPress, style }: PauseButtonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const state = useTween(paused ? 1 : 0, { durationMs: motion.duration.settle });
  const press = useSharedValue(0);
  const pressedScale = reduceMotion ? 1 : PRESSED_SCALE;

  const buttonStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(state.get(), [0, 1], [colors.hero, colors.accent]),
    opacity: interpolate(press.get(), [0, 1], [1, PRESSED_OPACITY]),
    transform: [{ scale: interpolate(press.get(), [0, 1], [1, pressedScale]) }],
  }));
  const pauseIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - state.get(),
    transform: [{ scale: 1 - 0.4 * state.get() }],
  }));
  const playIconStyle = useAnimatedStyle(() => ({
    opacity: state.get(),
    transform: [{ scale: 0.6 + 0.4 * state.get() }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={paused ? 'Resume workout timer' : 'Pause workout timer'}
      onPress={onPress}
      onPressIn={() => {
        press.set(
          withTiming(1, { duration: reduceMotion ? 0 : motion.duration.press, easing: motionEase }),
        );
      }}
      onPressOut={() => {
        press.set(
          withTiming(0, { duration: reduceMotion ? 0 : motion.duration.settle, easing: motionEase }),
        );
      }}
      style={[style, buttonStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.icon, pauseIconStyle]}>
        <Pause size={18} color={colors.heroInk} fill={colors.heroInk} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.icon, playIconStyle]}>
        <Play size={18} color={colors.accentInk} fill={colors.accentInk} />
      </Animated.View>
    </AnimatedPressable>
  );
}

type ElapsedTimerProps = {
  text: string;
  paused: boolean;
  /** The screen's own digit style (size, weight, tabular figures); only the colour is animated here. */
  style: StyleProp<TextStyle>;
};

/** The session clock's digits. They fade to the warning colour when paused, and back when resumed. */
export function ElapsedTimer({ text, paused, style }: ElapsedTimerProps) {
  const { colors } = useTheme();
  const color = useAnimatedColor(paused ? colors.warn : colors.ink);
  const colorStyle = useAnimatedStyle(() => ({ color: color.get() }));
  return <Animated.Text style={[style, colorStyle]}>{text}</Animated.Text>;
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
