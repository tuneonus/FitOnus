import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { progressApi } from '@/features/progress/api/progress-api';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { BarChart } from '@/shared/components/charts/BarChart';
import type { MetricKey } from '@/features/progress/types/progress';
import { ChevronLeft } from 'lucide-react-native';

export default function MetricDetailScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { colors } = useTheme();
  const router = useRouter();

  const userId = useAuthStore((state) => state.user?.id);
  const validMetrics: MetricKey[] = [
    'weight',
    'calories',
    'sleep',
    'protein',
    'workouts',
    'recovery',
    'steps',
    'water',
  ];
  const metric = validMetrics.includes(type as MetricKey) ? (type as MetricKey) : null;
  const query = useQuery({
    queryKey: ['dashboard', 'metric-detail', userId, metric],
    queryFn: () =>
      progressApi.getAnalytics({
        metric: metric!,
        range: 'M',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    enabled: !!userId && !!metric,
  });
  const points = query.data?.points ?? [];
  const values = points.map((point) => point.value);
  const average = values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
  // Capitalize first letter of type
  const title = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Metric Detail';

  return (
    <ScreenContainer edges={['top', 'bottom']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: title,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ marginLeft: -Spacing.sm, padding: Spacing.sm }}
            >
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.chartPlaceholder}>
          {points.length ? (
            <BarChart data={points} height={160} barColor={colors.primary} />
          ) : (
            <Text variant="bodyLarge" style={{ color: colors.textSecondary }}>
              {query.isLoading
                ? 'Loading records…'
                : query.isError
                  ? 'Could not load records. Pull to try again.'
                  : 'No records available yet.'}
            </Text>
          )}
        </View>

        <View style={styles.statsContainer}>
          <Text variant="headlineSmall" style={styles.sectionTitle}>
            Statistics
          </Text>
          <View style={[styles.statsCard, { backgroundColor: colors.backgroundElement }]}>
            <Text variant="bodyMedium">Average: {average?.toFixed(1) ?? '—'}</Text>
            <Text variant="bodyMedium">Min: {values.length ? Math.min(...values) : '—'}</Text>
            <Text variant="bodyMedium">Max: {values.length ? Math.max(...values) : '—'}</Text>
          </View>
        </View>

        <View style={styles.historyContainer}>
          <Text variant="headlineSmall" style={styles.sectionTitle}>
            History
          </Text>
          <View style={[styles.historyCard, { backgroundColor: colors.backgroundElement }]}>
            {points.length ? (
              points.map((point, index) => (
                <Text key={`${point.label}-${index}`} variant="bodyMedium">
                  {point.label}: {point.value} {query.data?.unit}
                </Text>
              ))
            ) : (
              <Text variant="bodyMedium" style={{ color: colors.textSecondary }}>
                No history available yet.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  chartPlaceholder: {
    height: 200,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  statsContainer: {
    marginBottom: Spacing.xl,
  },
  statsCard: {
    padding: Spacing.lg,
    borderRadius: Spacing.md,
  },
  historyContainer: {
    marginBottom: Spacing.xl,
  },
  historyCard: {
    padding: Spacing.lg,
    borderRadius: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
});
