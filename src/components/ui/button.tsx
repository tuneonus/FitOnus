import React from 'react';
import { Pressable, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Text } from './text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius, Animations } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  readonly title: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly isLoading?: boolean;
  readonly isDisabled?: boolean;
  readonly leftIcon?: React.ReactNode;
  readonly rightIcon?: React.ReactNode;
  readonly style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  isDisabled = false,
  leftIcon,
  rightIcon,
  style,
}: ButtonProps) => {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!isDisabled && !isLoading) {
      scale.value = withSpring(0.97, Animations.springSnappy);
    }
  };

  const handlePressOut = () => {
    if (!isDisabled && !isLoading) {
      scale.value = withSpring(1, Animations.springSnappy);
    }
  };

  // Determine colors based on variant
  let backgroundColor = colors.primary;
  let textColor = colors.textInverse;
  let borderColor = 'transparent';

  switch (variant) {
    case 'primary':
      backgroundColor = colors.primary;
      textColor = colors.textInverse;
      break;
    case 'secondary':
      backgroundColor = colors.primaryLight;
      textColor = colors.primary;
      break;
    case 'outline':
      backgroundColor = 'transparent';
      textColor = colors.text;
      borderColor = colors.border;
      break;
    case 'ghost':
      backgroundColor = 'transparent';
      textColor = colors.text;
      break;
    case 'destructive':
      backgroundColor = colors.error;
      textColor = colors.textInverse;
      break;
  }

  if (isDisabled) {
    backgroundColor = variant === 'outline' || variant === 'ghost' ? 'transparent' : colors.backgroundSelected;
    textColor = colors.textTertiary;
    borderColor = variant === 'outline' ? colors.border : 'transparent';
  }

  // Determine size
  let height = 44;
  let fontSize: 'labelMedium' | 'headlineSmall' | 'headlineMedium' = 'headlineSmall';
  
  if (size === 'sm') {
    height = 32;
    fontSize = 'labelMedium';
  } else if (size === 'lg') {
    height = 52;
    fontSize = 'headlineMedium';
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled || isLoading}
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor,
          borderWidth: variant === 'outline' ? 1 : 0,
          height,
        },
        animatedStyle,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
      accessibilityLabel={title}
    >
      {isLoading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {leftIcon}
          <Text variant={fontSize} style={{ color: textColor }}>
            {title}
          </Text>
          {rightIcon}
        </>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
});
