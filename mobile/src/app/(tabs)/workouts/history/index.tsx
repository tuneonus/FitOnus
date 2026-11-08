import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { Loading } from '@/components/ui/loading';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Clock, Trophy, Dumbbell } from 'lucide-react-native';
import { useWorkoutStore } from '@/features/workouts/store/workoutStore';
import type { WorkoutLog } from '@/features/workouts/types/workout';

export default function WorkoutHistoryScreen() {
  const { colors } = useTheme();
  const history = useWorkoutStore((state) => state.history);
  const loadHistoryFromBackend = useWorkoutStore((state) => state.loadHistoryFromBackend);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      await loadHistoryFromBackend();
    } catch {
      // Ignored
    }
  }, [loadHistoryFromBackend]);

  useEffect(() => {
    setIsLoading(true);
    void fetchHistory().finally(() => setIsLoading(false));
  }, [fetchHistory]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchHistory().finally(() => setIsRefreshing(false));
  };

  const renderItem = ({ item }: { item: WorkoutLog }) => (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.cardHeader}>
        <Text variant="headlineSmall" style={{ color: colors.text }}>{item.title}</Text>
        <Text variant="labelSmall" style={{ color: colors.textTertiary }}>{item.date}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Clock size={16} color={colors.primary} />
          <Text variant="labelMedium" style={{ color: colors.textSecondary, marginLeft: 4 }}>
            {item.durationMin}m
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="labelMedium" style={{ color: colors.primary, fontWeight: 'bold' }}>Vol:</Text>
          <Text variant="labelMedium" style={{ color: colors.textSecondary, marginLeft: 4 }}>
            {item.volumeKg > 0 ? `${item.volumeKg.toLocaleString()} kg` : '—'}
          </Text>
        </View>
        {item.prs > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.warningLight }]}>
            <Trophy size={14} color={colors.warning} />
            <Text variant="labelSmall" style={{ color: colors.warning, marginLeft: 4 }}>
              {item.prs} PR
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'History',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: '',
        }}
      />

      {isLoading && history.length === 0 ? (
        <Loading fullScreen />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { void handleRefresh(); }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <Card style={styles.emptyContainer}>
              <Dumbbell size={36} color={colors.textTertiary} style={{ marginBottom: Spacing.sm }} />
              <Text variant="headlineSmall" style={{ color: colors.text, marginBottom: 4 }}>
                No Workouts Yet
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                Completed workouts will appear here automatically.
              </Text>
            </Card>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: Spacing.md,
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: 'auto',
  },
  emptyContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
  },
});
