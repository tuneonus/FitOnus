import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { useAnimatedColor } from '@/hooks/use-animated-color';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/shared/theme/motion';

export type ToggleProps = {
  value?: boolean;
  checked?: boolean;
  onValueChange?: (val: boolean) => void;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/** How far the thumb travels from the off position to the on position (track 48 - thumb 24 - padding 2 x 2). */
const THUMB_TRAVEL = 20;

export function Toggle({
  value,
  checked,
  onValueChange,
  onChange,
  disabled = false,
  style,
}: ToggleProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const isChecked = checked !== undefined ? checked : Boolean(value);
  const handleChange = onValueChange || onChange || (() => {});

  // The thumb slides on the snappy spring while track and thumb colours fade, instead of jumping to the new state.
  const position = useSharedValue(isChecked ? 1 : 0);
  const trackColor = useAnimatedColor(isChecked ? colors.ink : colors.surface2);
  const thumbColor = useAnimatedColor(isChecked ? colors.accent : colors.surface);

  useEffect(() => {
    const target = isChecked ? 1 : 0;
    position.set(reduceMotion ? target : withSpring(target, motion.spring.snappy));
  }, [isChecked, reduceMotion, position]);

  const trackStyle = useAnimatedStyle(() => ({ backgroundColor: trackColor.get() }));
  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: thumbColor.get(),
    transform: [{ translateX: position.get() * THUMB_TRAVEL }],
  }));

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={() => handleChange(!isChecked)}
      style={[styles.track, { opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fill, trackStyle]} />
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  fill: {
    borderRadius: 14,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
