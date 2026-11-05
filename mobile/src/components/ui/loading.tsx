import React from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export interface LoadingProps {
  size?: 'small' | 'large';
  color?: string; // hex or semantic theme color key
  style?: ViewStyle;
  fullScreen?: boolean;
}

export const Loading = ({ size = 'large', color, style, fullScreen = false }: LoadingProps) => {
  const { colors } = useTheme();

  const indicatorColor = color
    ? (color.startsWith('#') || color.startsWith('rgb') ? color : colors[color as keyof typeof colors] as string)
    : colors.primary;

  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.background }, style]}>
        <ActivityIndicator size={size} color={indicatorColor} />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={indicatorColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
