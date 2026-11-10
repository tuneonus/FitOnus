import { premium } from '@/shared/theme/premium';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight, Dumbbell, Play, Plus, Sparkles, Trash2 } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { FeatureScreen as Screen } from '@/shared/components/ui/FeatureScreen';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Button } from '../../../shared/components/ui/Button';
import { showToast } from '../../../shared/stores/toastStore';
import { useWorkoutStore } from '../store/workoutStore';
import { useTheme } from '@/hooks/use-theme';

export function WorkoutPlanScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { plannedSession, removePlannedExercise, setPlannedSession, todayStatus, getExerciseById } =
    useWorkoutStore();
  const [editing, setEditing] = useState(false);

  const remove = (id: string) => {
    const before = plannedSession;
    removePlannedExercise(id);
    showToast({
      message: `${getExerciseById(id)?.name || 'Exercise'} removed`,
      actionLabel: 'Undo',
      onAction: () => setPlannedSession(before),
    });
  };

  if (!plannedSession || plannedSession.exercises.length === 0) {
    return (
      <Screen title="Workout">
        <EmptyState
          appearance="premium"
          icon={Dumbbell}
          title="No workout planned"
          body="Choose a workout template or use the generator to create a routine tailored to your goals."
          actionLabel="Build a workout"
          onAction={() => navigate('workoutGenerator')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Workout"
      headerRight={
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setEditing((e) => !e)}
          style={styles.headerBtn}
        >
          <Text style={[styles.headerBtnText, { color: colors.ink }]}>
            {editing ? 'Done' : 'Customize'}
          </Text>
        </TouchableOpacity>
      }
      footer={
        <Button
          appearance="premium"
          size="lg"
          fullWidth
          icon={Play}
          disabled={todayStatus === 'completed' || plannedSession.exercises.length === 0}
          title={
            todayStatus === 'inProgress'
              ? 'Resume workout'
              : todayStatus === 'completed'
                ? 'Completed today'
                : 'Start workout'
          }
          onPress={() => navigate('activeWorkout')}
        />
      }
    >
      <View style={styles.headerArea}>
        <Text style={[styles.focus, { color: colors.muted }]}>Workout plan</Text>
        <Text style={[styles.title, { color: colors.ink }]}>{plannedSession.title}</Text>

        <View style={[styles.statsGrid, { borderColor: colors.line }]}>
          {[
            ['Duration', `${plannedSession.durationMin} min`],
            ['Exercises', String(plannedSession.exercises.length)],
            ['Sets', String(plannedSession.exercises.reduce((s, e) => s + e.sets, 0))],
          ].map(([l, v]) => (
            <View key={l} style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{l}</Text>
              <Text style={[styles.statVal, { color: colors.ink }]}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.progressionCard, { backgroundColor: colors.surface2 }]}>
          <Sparkles size={15} color={colors.accent} style={{ marginTop: 2 }} />
          <Text style={[styles.progressionText, { color: colors.ink }]}>
            Review your working weights before training. Personal records are calculated from your
            saved sets.
          </Text>
        </View>
      </View>

      <View style={styles.exercisesList}>
        {plannedSession.exercises.map((p, i) => {
          const ex = getExerciseById(p.exerciseId);
          return (
            <View
              key={p.exerciseId}
              style={[
                styles.exerciseItem,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigate('exerciseDetail', { id: p.exerciseId })}
                style={styles.exerciseMain}
              >
                <View style={[styles.indexCircle, { backgroundColor: colors.surface2 }]}>
                  <Text style={[styles.indexText, { color: colors.ink }]}>{i + 1}</Text>
                </View>

                <View style={styles.exerciseTextCol}>
                  <Text style={[styles.exerciseName, { color: colors.ink }]} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text style={[styles.exerciseDetails, { color: colors.muted }]}>
                    {p.sets} × {p.reps}
                    {p.weight ? ` · ${p.weight} kg` : ' · BW'} · rest {p.restSec}s
                  </Text>
                </View>

                {!editing && <ChevronRight size={16} color={colors.muted} />}
              </TouchableOpacity>

              {editing && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => remove(p.exerciseId)}
                  style={styles.deleteBtn}
                >
                  <Trash2 size={18} color={colors.bad} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {editing && (
          <View style={{ paddingTop: 12 }}>
            <Button
              appearance="premium"
              variant="outline"
              fullWidth
              icon={Plus}
              title="Add exercise"
              onPress={() => navigate('exerciseLibrary', { pick: '1' })}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    paddingHorizontal: 12,
    minHeight: premium.layout.touch,
    justifyContent: 'center',
  },
  headerBtnText: {
    ...premium.type.body,
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  focus: {
    ...premium.type.caption,
  },
  title: {
    ...premium.type.display,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 14,
    marginTop: 16,
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    ...premium.type.caption,
  },
  statVal: {
    ...premium.type.metric,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  progressionCard: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
  },
  progressionText: {
    ...premium.type.body,
    flex: 1,
  },
  exercisesList: {
    paddingHorizontal: 16,
    marginTop: 20,
    gap: 10,
    paddingBottom: 32,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  exerciseMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  indexCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    ...premium.type.caption,
  },
  exerciseTextCol: {
    flex: 1,
  },
  exerciseName: {
    ...premium.type.body,
  },
  exerciseDetails: {
    ...premium.type.caption,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  deleteBtn: {
    width: 44,
    minHeight: premium.layout.touch,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
});
