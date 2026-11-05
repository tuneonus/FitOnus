import React from 'react';
import { View, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { BorderRadius, Spacing, Shadows, Animations } from '@/constants/theme';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Card = ({ children, style, onPress, padding = 'lg' }: CardProps) => {
  const { colors, isDark } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(0.98, Animations.springSnappy);
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      scale.value = withSpring(1, Animations.springSnappy);
    }
  };

  const getPadding = () => {
    switch (padding) {
      case 'none': return 0;
      case 'sm': return Spacing.sm;
      case 'md': return Spacing.md;
      case 'lg': return Spacing.lg;
      default: return Spacing.lg;
    }
  };

  const containerStyle = [
    styles.container,
    {
      backgroundColor: colors.backgroundElement,
      padding: getPadding(),
      ...(isDark ? {
        borderWidth: 1,
        borderColor: colors.border,
      } : Shadows.light.shadowSmall),
    },
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[containerStyle, animatedStyle]}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={containerStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
  },
});
