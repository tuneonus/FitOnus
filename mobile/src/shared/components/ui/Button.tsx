import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { premium } from '@/shared/theme/premium';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  appearance?: 'default' | 'premium';
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  iconRight?: React.ComponentType<{ size?: number; color?: string }>;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function Button({
  appearance = 'default',
  title,
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  onPress,
  style,
  textStyle,
}: ButtonProps) {
  const { colors } = useTheme();

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;

  let bgColor = colors.accent;
  let textColor = colors.accentInk;
  let borderColor = 'transparent';
  let borderWidth = 0;

  switch (variant) {
    case 'primary':
      bgColor = colors.accent;
      textColor = colors.accentInk;
      break;
    case 'secondary':
      bgColor = colors.surface2;
      textColor = colors.ink;
      break;
    case 'outline':
      bgColor = colors.surface;
      textColor = colors.ink;
      borderColor = colors.line;
      borderWidth = 1;
      break;
    case 'ghost':
      bgColor = 'transparent';
      textColor = colors.ink;
      break;
    case 'danger':
      bgColor = 'rgba(214, 40, 40, 0.12)';
      textColor = colors.bad;
      break;
    case 'inverse':
      bgColor = colors.ink;
      textColor = colors.bg;
      break;
  }

  const height = size === 'sm' ? 44 : size === 'lg' ? 56 : 48;
  const paddingH = size === 'sm' ? 14 : size === 'lg' ? 24 : 18;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 16 : 14.5;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        styles.button,
        {
          minHeight: appearance === 'premium' ? Math.max(premium.layout.touch, height) : height,
          paddingVertical: 12,
          paddingHorizontal: paddingH,
          backgroundColor: bgColor,
          borderColor,
          borderWidth,
          borderRadius: appearance === 'premium' ? premium.radius.control : height / 2,
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        fullWidth && { width: '100%' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={styles.content}>
          {Icon ? (
            <View style={styles.leftIcon}>
              <Icon size={iconSize} color={textColor} />
            </View>
          ) : null}
          {title ? (
            <Text
              style={[
                styles.text,
                {
                  color: textColor,
                  fontSize,
                },
                textStyle,
              ]}
            >
              {title}
            </Text>
          ) : React.isValidElement(children) ? (
            children
          ) : children !== null && children !== undefined ? (
            <Text
              style={[
                styles.text,
                {
                  color: textColor,
                  fontSize,
                },
                textStyle,
              ]}
            >
              {children}
            </Text>
          ) : null}
          {IconRight ? (
            <View style={styles.rightIcon}>
              <IconRight size={iconSize} color={textColor} />
            </View>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flexShrink: 1,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
});
