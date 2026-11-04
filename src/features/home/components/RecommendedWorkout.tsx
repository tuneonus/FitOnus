import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles, CheckCircle2, Play } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { Button } from '../../../shared/components/ui/Button';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../../workouts/store/workoutStore';
import { exerciseById } from '../../workouts/data/workoutsMock';
import { useTheme } from '@/hooks/use-theme';

export function RecommendedWorkout() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const { plannedSession, todayStatus, startSession } = useWorkoutStore();

  const preview = plannedSession.exercises.slice(0, 3);
  const remaining = plannedSession.exercises.length - preview.length;

  const handleStart = () => {
    startSession();
    navigate('activeWorkout');
  };

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Today’s training"
        actionLabel="Workouts"
        onAction={() => navigate('workouts')}
      />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigate('workoutPlan')}
        >
          <Text style={[styles.focusLabel, { color: colors.muted }]}>
            {plannedSession.focus}
          </Text>
          <Text style={[styles.title, { color: colors.ink }]}>
            {plannedSession.title}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {plannedSession.durationMin} min · {plannedSession.exercises.length}{' '}
            exercises · {plannedSession.intensity}
          </Text>
        </TouchableOpacity>

        {/* Coach Insight Pill */}
        <View
          style={[styles.coachBox, { backgroundColor: colors.surface2 }]}
        >
          <Sparkles size={15} color={colors.accentStrong} style={styles.coachIcon} />
          <Text style={[styles.coachText, { color: colors.ink }]}>
            {hasDevice
              ? 'Recovery 84 supports heavier pressing, and your last chest session was Monday.'
              : 'Scheduled from your plan. Connect a wearable so I can adapt intensity to your recovery.'}
          </Text>
        </View>

        {/* Preview exercises */}
        <View style={styles.exercisesList}>
          {preview.map((p, idx) => {
            const ex = exerciseById(p.exerciseId);
            return (
              <TouchableOpacity
                key={p.exerciseId}
                activeOpacity={0.7}
                onPress={() => navigate('exerciseDetail', { id: p.exerciseId })}
                style={[
                  styles.exerciseRow,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                ]}
              >
                <Text
                  style={[styles.exerciseName, { color: colors.ink }]}
                  numberOfLines={1}
                >
                  {ex ? ex.name : p.exerciseId}
                </Text>
                <Text style={[styles.exerciseSets, { color: colors.muted }]}>
                  {p.sets} × {p.reps}
                  {p.weight ? ` · ${p.weight} kg` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}

          {remaining > 0 && (
            <TouchableOpacity
              onPress={() => navigate('workoutPlan')}
              style={styles.moreButton}
            >
              <Text style={[styles.moreText, { color: colors.muted }]}>
                +{remaining} more exercises
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer Actions */}
        <View
          style={[
            styles.footerRow,
            { borderTopColor: colors.line },
          ]}
        >
          {todayStatus === 'completed' ? (
            <View style={styles.completedRow}>
              <View style={styles.checkRow}>
                <CheckCircle2 size={18} color={colors.good} />
                <Text style={[styles.completedText, { color: colors.good }]}>
                  Completed today
                </Text>
              </View>
              <Button
                title="View summary"
                variant="outline"
                size="sm"
                onPress={() => navigate('workoutComplete')}
              />
            </View>
          ) : (
            <View style={styles.actionRow}>
              <Button
                title="Start workout"
                size="md"
                icon={Play}
                onPress={handleStart}
                style={styles.flexBtn}
              />
              <Button
                title="Customize"
                variant="outline"
                size="md"
                onPress={() => navigate('workoutPlan')}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginTop: 4,
  },
  focusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 13,
    marginTop: 4,
  },
  coachBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    marginTop: 14,
  },
  coachIcon: {
    marginTop: 2,
  },
  coachText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  exercisesList: {
    marginTop: 12,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  exerciseName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  exerciseSets: {
    fontSize: 12.5,
    fontFamily: 'monospace',
  },
  moreButton: {
    paddingVertical: 8,
  },
  moreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 14,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flexBtn: {
    flex: 1,
  },
});

