import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BookOpen, History, Trophy, BarChart3, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { FeatureScreen } from '@/shared/components/ui/FeatureScreen';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { Card } from '@/shared/components/ui/Card';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { MetricDisplay } from '@/shared/components/ui/MetricDisplay';
import { RecommendedWorkout } from '@/features/home/components/RecommendedWorkout';
import { useWorkoutStore } from '../store/workoutStore';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export function WorkoutsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { history, loadHistoryFromBackend, loadExercises, syncOfflineSessions, pendingSyncCount } =
    useWorkoutStore();
  // When nothing is planned the card above already offers "Build a workout"; avoid a duplicate CTA.
  const hasPlan = useWorkoutStore(
    (s) => (s.plannedSession?.exercises?.length ?? 0) > 0 || s.todayStatus !== 'notStarted',
  );
  useEffect(() => {
    void loadHistoryFromBackend();
    void loadExercises();
    void syncOfflineSessions();
  }, [loadHistoryFromBackend, loadExercises, syncOfflineSessions]);
  return (
    <FeatureScreen title="Training" showBack subtitle="Your plan. Your pace. Every set counts.">
      <View style={styles.content}>
        <RecommendedWorkout showLibraryLink={false} />
        {hasPlan ? (
          <Card tone="hero" appearance="premium">
            <Text style={[premium.type.eyebrow, { color: colors.highlight }]}>
              BUILD YOUR NEXT SESSION
            </Text>
            <Text style={[styles.title, { color: colors.heroInk }]}>Make it fit your day.</Text>
            <Text style={[styles.body, { color: colors.heroMuted }]}>
              Choose your goal, time and equipment. Review your generated plan before you train.
            </Text>
            <ActionButton
              title="Create a workout"
              icon={Sparkles}
              onPress={() => navigate('workoutGenerator')}
              style={styles.create}
            />
          </Card>
        ) : null}
        <View>
          <SectionHeader
            appearance="premium"
            title="Your training log"
            actionLabel="History"
            onAction={() => navigate('workoutHistory')}
          />
          <Card style={styles.metrics}>
            <MetricDisplay
              label="Saved sessions"
              value={String(history.length)}
              detail="In your loaded history"
            />
            <MetricDisplay
              label="Logged sets"
              value={history.reduce((sum, log) => sum + log.sets, 0).toLocaleString()}
              detail="From saved sessions"
            />
          </Card>
          {pendingSyncCount > 0 ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[premium.type.caption, styles.pending, { color: colors.muted }]}
            >
              {pendingSyncCount} saved session(s) waiting to sync.
            </Text>
          ) : null}
        </View>
        <View>
          <SectionHeader title="Keep progressing" />
          <ListGroup style={styles.group}>
            <ListRow
              icon={BookOpen}
              title="Exercise library"
              subtitle="Find movements by muscle and equipment."
              onPress={() => navigate('exerciseLibrary')}
            />
            <ListRow
              icon={History}
              title="Workout history"
              subtitle="Review sessions, sets and training volume."
              onPress={() => navigate('workoutHistory')}
            />
            <ListRow
              icon={Trophy}
              title="Personal records"
              subtitle="See your recorded best performances."
              onPress={() => navigate('personalRecords')}
            />
            <ListRow
              icon={BarChart3}
              title="Training analytics"
              subtitle="Explore your volume, frequency and progress."
              onPress={() => navigate('workoutAnalytics')}
            />
          </ListGroup>
        </View>
      </View>
    </FeatureScreen>
  );
}
const styles = StyleSheet.create({
  content: { gap: premium.space.xl, paddingBottom: 24 },
  title: { ...premium.type.title, marginTop: 16 },
  body: { ...premium.type.body, marginTop: 10 },
  create: { marginTop: 24 },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  pending: { marginTop: 8 },
  group: { marginVertical: 0 },
});
