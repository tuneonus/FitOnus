import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'sleep';

export type BadgeProps = {
  tone?: BadgeTone;
  children: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function Badge({
  tone = 'neutral',
  children,
  style,
  textStyle,
}: BadgeProps) {
  const { colors } = useTheme();

  let bgColor = 'rgba(17, 18, 16, 0.08)';
  let textColor = colors.ink;

  switch (tone) {
    case 'neutral':
      bgColor = 'rgba(128, 128, 128, 0.12)';
      textColor = colors.ink;
      break;
    case 'good':
      bgColor = 'rgba(22, 140, 64, 0.14)';
      textColor = colors.good;
      break;
    case 'warn':
      bgColor = 'rgba(214, 120, 10, 0.14)';
      textColor = colors.warn;
      break;
    case 'bad':
      bgColor = 'rgba(214, 40, 40, 0.12)';
      textColor = colors.bad;
      break;
    case 'accent':
      bgColor = 'rgba(200, 245, 60, 0.25)';
      textColor = colors.accentStrong;
      break;
    case 'sleep':
      bgColor = 'rgba(99, 102, 241, 0.14)';
      textColor = colors.sleep;
      break;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }, style]}>
      {typeof children === 'string' ? (
        <Text style={[styles.text, { color: textColor }, textStyle]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});

