import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export type CardProps = {
  children?: React.ReactNode;
  padded?: boolean;
  tone?: 'default' | 'muted' | 'hero';
  appearance?: 'default' | 'premium';
  style?: ViewStyle;
};

export function Card({
  children,
  padded = true,
  tone = 'default',
  appearance = 'default',
  style,
}: CardProps) {
  const { colors } = useTheme();

  let bgColor = colors.surface;
  let borderColor = colors.line;
  let borderWidth = 1;

  if (tone === 'muted') {
    bgColor = colors.surface2;
    borderColor = 'transparent';
    borderWidth = 0;
  } else if (tone === 'hero') {
    bgColor = colors.hero;
    borderColor = 'rgba(244, 244, 238, 0.08)';
    borderWidth = 1;
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bgColor,
          borderColor,
          borderWidth,
          padding: padded ? (appearance === 'premium' ? premium.space.xl : 16) : 0,
          borderRadius: appearance === 'premium' ? premium.radius.card : 24,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
  },
});
