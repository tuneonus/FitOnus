import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CheckCircle2, Dumbbell, Play, ArrowUpRight } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useWorkoutStore } from '@/features/workouts/store/workoutStore';
import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/shared/components/ui/Card';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { premium } from '@/shared/theme/premium';

export function RecommendedWorkout() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const plannedSession = useWorkoutStore((s) => s.plannedSession);
  const todayStatus = useWorkoutStore((s) => s.todayStatus);
  const startSession = useWorkoutStore((s) => s.startSession);
  const getExerciseById = useWorkoutStore((s) => s.getExerciseById);
  const lastCompleted = useWorkoutStore((s) => s.lastCompleted);
  const completed = todayStatus === 'completed' && lastCompleted !== null;
  const inProgress = todayStatus === 'inProgress';
  const hasExercises = plannedSession.exercises.length > 0;
  return (
    <View>
      <SectionHeader
        appearance="premium"
        title="Your training"
        actionLabel="All workouts"
        onAction={() => navigate('workouts')}
      />
      <Card appearance="premium" style={styles.card}>
        <View style={styles.statusRow}>
          {completed ? (
            <CheckCircle2 size={18} color={colors.good} />
          ) : (
            <Dumbbell size={18} color={colors.accentStrong} />
          )}
          <Text style={[premium.type.eyebrow, { color: completed ? colors.good : colors.muted }]}>
            {completed ? 'SESSION COMPLETE' : inProgress ? 'IN PROGRESS' : 'WORKOUT PLAN'}
          </Text>
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {completed ? lastCompleted.title : plannedSession.title}
        </Text>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {completed
            ? `${lastCompleted.durationMin} min · ${lastCompleted.sets} sets logged`
            : `${plannedSession.durationMin} min plan · ${plannedSession.exercises.length} exercises`}
        </Text>
        {!completed && hasExercises ? (
          <View style={styles.preview}>
            {plannedSession.exercises.slice(0, 2).map((exercise, index) => (
              <Pressable
                key={`${exercise.exerciseId}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`View ${getExerciseById(exercise.exerciseId).name}, ${exercise.sets} sets of ${exercise.reps}`}
                onPress={() => navigate('exerciseDetail', { id: exercise.exerciseId })}
                style={({ pressed }) => [
                  styles.exercise,
                  { borderTopColor: colors.line, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.exerciseName, { color: colors.ink }]}>
                  {getExerciseById(exercise.exerciseId).name}
                </Text>
                <Text style={[premium.type.caption, { color: colors.muted }]}>
                  {exercise.sets} × {exercise.reps}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          <ActionButton
            title={
              completed
                ? 'View summary'
                : inProgress
                  ? 'Resume workout'
                  : hasExercises
                    ? 'Start workout'
                    : 'Build a workout'
            }
            icon={completed ? CheckCircle2 : Play}
            variant="inverse"
            style={styles.start}
            onPress={() => {
              if (completed) {
                navigate('workoutComplete');
                return;
              }
              if (inProgress) {
                navigate('activeWorkout');
                return;
              }
              if (!hasExercises) {
                navigate('workoutGenerator');
                return;
              }
              startSession();
              navigate('activeWorkout');
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Customize your workout plan"
            onPress={() => navigate('workoutPlan')}
            style={({ pressed }) => [
              styles.plan,
              { borderColor: colors.line, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ArrowUpRight size={20} color={colors.ink} />
          </Pressable>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { ...premium.type.title, marginTop: 16 },
  meta: { ...premium.type.caption, marginTop: 8 },
  preview: { marginTop: 20 },
  exercise: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  exerciseName: { ...premium.type.body, flex: 1, minWidth: 100 },
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 20 },
  start: { flex: 1 },
  plan: {
    width: 52,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: premium.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
