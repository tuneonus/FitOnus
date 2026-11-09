import React, { useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Trophy } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { FeatureScreen } from '@/shared/components/ui/FeatureScreen';
import { ActionRow } from '@/shared/components/ui/ActionRow';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { MetricDisplay } from '@/shared/components/ui/MetricDisplay';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { useWorkoutStore } from '../store/workoutStore';
import { workoutApi } from '../api/workout-api';
import { historyForPresentation } from '../utils/premium-workout';

export function WorkoutHistoryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const saved = useWorkoutStore((state) => state.history);
  const query = useQuery({
    queryKey: ['workouts', 'premium-history'],
    queryFn: () => workoutApi.getWorkoutSessions({ limit: 20 }),
    retry: 1,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (query.data)
      useWorkoutStore.setState((state) => ({
        history: historyForPresentation(query.data.sessions, state.history),
      }));
  }, [query.data]);
  return (
    <FeatureScreen
      title="Workout history"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
          }}
          tintColor={colors.accentStrong}
        />
      }
    >
      <View style={styles.content}>
        <Text style={[premium.type.body, { color: colors.muted }]}>
          The work you’ve put in, one session at a time.
        </Text>
        {query.isError ? (
          <StatusBanner
            tone="error"
            title="Couldn’t refresh your history"
            body="Any saved sessions below are still available."
            actionLabel="Retry"
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : null}
        {query.isLoading && !saved.length ? (
          <View
            accessibilityLabel="Loading workout history"
            accessibilityState={{ busy: true }}
            style={styles.content}
          >
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={88} radius={premium.radius.card} />
            ))}
          </View>
        ) : (
          <>
            {saved.length ? (
              <>
                <View style={[styles.metrics, { borderColor: colors.line }]}>
                  <MetricDisplay label="Loaded sessions" value={String(saved.length)} />
                  <MetricDisplay
                    label="Total training time"
                    value={saved.reduce((sum, log) => sum + log.durationMin, 0).toLocaleString()}
                    unit="min"
                  />
                </View>
                <View>
                  <SectionHeader appearance="premium" title="Recent sessions" />
                  {saved.map((log) => (
                    <ActionRow
                      key={log.id}
                      icon={Dumbbell}
                      title={log.title}
                      detail={`${log.date} · ${log.durationMin} min · ${log.sets} sets${log.pendingSync ? ' · Sync pending' : ''}`}
                      onPress={() => navigate('workoutHistoryDetail', { id: log.id })}
                    />
                  ))}
                </View>
              </>
            ) : !query.isError ? (
              <EmptyState
                appearance="premium"
                icon={Dumbbell}
                title="Your first session starts a story"
                body="Completed and saved workouts will appear here."
                actionLabel="Choose a workout"
                onAction={() => navigate('workouts')}
              />
            ) : null}
          </>
        )}
        <ActionRow
          icon={Trophy}
          title="Personal records"
          detail="Explore your recorded best performances."
          onPress={() => navigate('personalRecords')}
        />
      </View>
    </FeatureScreen>
  );
}
const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: 24 },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
