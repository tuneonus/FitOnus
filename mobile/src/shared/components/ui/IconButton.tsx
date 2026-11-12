import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type IconButtonProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  variant?: 'ghost' | 'outline' | 'surface' | 'accent' | 'hero';
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  label?: string;
};

export function IconButton({
  icon: Icon,
  onPress,
  size = 44,
  iconSize = 20,
  variant = 'surface',
  disabled = false,
  style,
  accessibilityLabel,
  label,
}: IconButtonProps) {
  const { colors } = useTheme();
  const a11yLabel = accessibilityLabel || label;

  let bgColor = colors.surface2;
  let iconColor = colors.ink;
  let borderColor = 'transparent';
  let borderWidth = 0;

  switch (variant) {
    case 'ghost':
      bgColor = 'transparent';
      iconColor = colors.ink;
      break;
    case 'outline':
      bgColor = colors.surface;
      iconColor = colors.ink;
      borderColor = colors.line;
      borderWidth = 1;
      break;
    case 'surface':
      bgColor = colors.surface2;
      iconColor = colors.ink;
      break;
    case 'accent':
      bgColor = colors.accent;
      iconColor = colors.accentInk;
      break;
    case 'hero':
      bgColor = 'rgba(244, 244, 238, 0.12)';
      iconColor = colors.heroInk;
      break;
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [
        styles.button,
        {
          transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
          borderColor,
          borderWidth,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <Icon size={iconSize} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
