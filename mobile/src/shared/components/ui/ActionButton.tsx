import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

type Props = {
  title: string;
  onPress: () => void;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  variant?: 'primary' | 'secondary' | 'inverse';
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Opt-in premium button; the existing Button API and its consumers are preserved. */
export function ActionButton({
  title,
  onPress,
  icon: Icon,
  variant = 'primary',
  accessibilityLabel,
  disabled = false,
  loading = false,
  style,
}: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ink =
    variant === 'primary' ? colors.accentInk : variant === 'inverse' ? colors.heroInk : colors.ink;
  const background =
    variant === 'primary' ? colors.accent : variant === 'inverse' ? colors.hero : colors.surface2;
  const unavailable = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPressIn={() => {
        scale.value = withTiming(reducedMotion ? 1 : 0.98, { duration: premium.motion.press });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: reducedMotion ? 0 : premium.motion.settle });
      }}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[
        styles.button,
        { backgroundColor: background, opacity: unavailable ? 0.55 : 1 },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : Icon ? (
        <Icon size={18} color={ink} />
      ) : null}
      <Text style={[styles.label, { color: ink }]}>{title}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: premium.layout.touch,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: premium.radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { ...premium.type.label, flexShrink: 1, textAlign: 'center' },
});
