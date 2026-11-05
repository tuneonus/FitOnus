import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, TextStyle } from 'react-native';
import { Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TypographyVariant = keyof typeof Typography;

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: string; // Hex color or semantic color key
  align?: TextStyle['textAlign'];
  style?: TextStyle | TextStyle[];
}

export const Text = ({
  variant = 'bodyLarge',
  color,
  align = 'left',
  style,
  children,
  ...rest
}: TextProps) => {
  const { colors } = useTheme();

  // If a raw hex color is provided, use it. Otherwise try to use it as a key from the theme colors.
  const textColor = color 
    ? (color.startsWith('#') || color.startsWith('rgb') ? color : colors[color as keyof typeof colors])
    : colors.text;

  const typographyStyle = Typography[variant];

  return (
    <RNText
      style={[
        typographyStyle,
        { color: textColor as string, textAlign: align },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
};
