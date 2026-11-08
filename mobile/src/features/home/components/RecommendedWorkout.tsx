import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles, CheckCircle2, Play, Dumbbell, Clock3, Zap } from 'lucide-react-native';
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

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`View workout plan: ${plannedSession.title}`}
          onPress={() => navigate('workoutPlan')}
        >
          <View style={styles.workoutHeader}>
            <View style={[styles.workoutIcon, { backgroundColor: `${colors.accent}30` }]}>
              <Dumbbell size={20} color={colors.accentStrong} />
            </View>
            <Text style={[styles.focusLabel, { color: colors.accentStrong }]}>
              {plannedSession.focus}
            </Text>
          </View>
          <Text style={[styles.title, { color: colors.ink }]}>{plannedSession.title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Clock3 size={13} color={colors.muted} />
              <Text style={[styles.meta, { color: colors.muted }]}>
                {plannedSession.durationMin} min
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Dumbbell size={13} color={colors.muted} />
              <Text style={[styles.meta, { color: colors.muted }]}>
                {plannedSession.exercises.length} exercises
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Zap size={13} color={colors.muted} />
              <Text style={[styles.meta, { color: colors.muted }]}>{plannedSession.intensity}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Coach Insight Pill */}
        <View style={[styles.coachBox, { backgroundColor: colors.surface2 }]}>
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
                accessibilityRole="button"
                activeOpacity={0.7}
                onPress={() => navigate('exerciseDetail', { id: p.exerciseId })}
                style={[
                  styles.exerciseRow,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                ]}
              >
                <View style={[styles.exerciseNumber, { backgroundColor: colors.surface2 }]}>
                  <Text style={[styles.exerciseNumberText, { color: colors.muted }]}>
                    {String(idx + 1).padStart(2, '0')}
                  </Text>
                </View>
                <Text style={[styles.exerciseName, { color: colors.ink }]} numberOfLines={1}>
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
            <TouchableOpacity onPress={() => navigate('workoutPlan')} style={styles.moreButton}>
              <Text style={[styles.moreText, { color: colors.muted }]}>
                +{remaining} more exercises
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer Actions */}
        <View style={[styles.footerRow, { borderTopColor: colors.line }]}>
          {todayStatus === 'completed' ? (
            <View style={styles.completedRow}>
              <View style={styles.checkRow}>
                <CheckCircle2 size={18} color={colors.good} />
                <Text style={[styles.completedText, { color: colors.good }]}>Completed today</Text>
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
    flex: 1,
  },
  workoutHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  workoutIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: 12,
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
    minHeight: 48,
    gap: 10,
  },
  exerciseNumber: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumberText: { fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  exerciseName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  exerciseSets: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    textAlign: 'right',
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
    flexWrap: 'wrap',
    gap: 12,
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  flexBtn: {
    flex: 1,
  },
});
