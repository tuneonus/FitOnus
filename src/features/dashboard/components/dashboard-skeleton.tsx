import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SkeletonBlock = ({ width, height, borderRadius = BorderRadius.md, style, colors, animatedStyle }: any) => (
  <Animated.View
    style={[
      { width, height, borderRadius, backgroundColor: colors.surface },
      animatedStyle,
      style,
    ]}
  />
);

export const DashboardSkeleton = () => {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000 }),
        withTiming(0.5, { duration: 1000 })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <ScreenContainer edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        {/* Header Skeleton */}
        <View style={styles.headerRow}>
          <View>
            <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width={120} height={16} style={{ marginBottom: 8 }} />
            <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width={200} height={32} />
          </View>
          <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width={48} height={48} borderRadius={24} />
        </View>

        {/* Metrics Row Skeleton */}
        <View style={styles.row}>
          <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width="30%" height={100} />
          <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width="30%" height={100} />
          <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width="30%" height={100} />
        </View>

        {/* AI Summary Skeleton */}
        <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width="100%" height={160} style={{ marginVertical: Spacing.xl }} />

        {/* Today's Workout Skeleton */}
        <SkeletonBlock colors={colors} animatedStyle={animatedStyle} width="100%" height={120} />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
