import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export type CardProps = {
  children?: React.ReactNode;
  padded?: boolean;
  tone?: 'default' | 'muted' | 'hero' | 'accent';
  appearance?: 'default' | 'premium';
  style?: ViewStyle;
};

/**
 * Surface container. All cards share one radius so screens read as one system;
 * `premium` only adds more breathing room for hero content.
 */
export function Card({
  children,
  padded = true,
  tone = 'default',
  appearance = 'default',
  style,
}: CardProps) {
  const { colors, isDark } = useTheme();

  let bgColor = colors.surface;
  let borderColor = isDark ? '#FFFFFF59' : colors.line;

  if (tone === 'muted') {
    bgColor = colors.surface2;
    borderColor = 'transparent';
  } else if (tone === 'hero') {
    bgColor = colors.hero;
    borderColor = 'rgba(244, 244, 238, 0.08)';
  } else if (tone === 'accent') {
    bgColor = colors.accentSoft;
    borderColor = 'transparent';
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bgColor,
          borderColor,
          padding: padded ? (appearance === 'premium' ? premium.space.xl : 18) : 0,
          borderRadius: appearance === 'premium' ? premium.radius.hero : premium.radius.card,
          // Soft ink-tinted shadow on resting surfaces; dark themes rely on the border.
          ...(tone === 'default' && !isDark ? restingShadow : null),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const restingShadow: ViewStyle = { boxShadow: '0px 1px 3px rgba(14, 23, 38, 0.06)' };

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
});
