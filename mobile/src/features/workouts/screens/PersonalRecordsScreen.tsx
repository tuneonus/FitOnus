import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { Screen } from '../../../shared/components/ui/Screen';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { Sparkline } from '../../../shared/components/charts/Sparkline';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { WorkoutService } from '../services/workout-service';
import type { PersonalRecordView } from '../types/workout';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';

export function PersonalRecordsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [records, setRecords] = useState<PersonalRecordView[]>([]);
  const [selectedLift, setSelectedLift] = useState<string>('');

  useEffect(() => {
    WorkoutService.getPersonalRecords()
      .then((data) => {
        setRecords(data);
        if (data.length > 0 && data[0]?.exerciseName) {
          setSelectedLift(data[0].exerciseName);
        }
      })
      .catch(() => {});
  }, []);

  const activeRec = records.find((r) => r.exerciseName === selectedLift) || records[0];
  const activeWeight = activeRec?.weightKg ?? activeRec?.value ?? 0;
  const activeReps = activeRec?.reps ?? 1;
  const activeE1rm = Math.round(activeWeight * (1 + activeReps / 30));

  return (
    <Screen title="Personal records">
      <View style={styles.content}>
        {!activeRec || records.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No personal records yet"
            body="Complete your first workout to establish your baseline personal records."
            actionLabel="Start a workout"
            onAction={() => navigate('activeWorkout')}
          />
        ) : (
          <>
            {/* Selected Lift Detail Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                },
              ]}
            >
              <Text style={[styles.liftName, { color: colors.muted }]}>
                {activeRec.exerciseName}
              </Text>
              <Text style={[styles.liftBest, { color: colors.ink }]}>
                {activeWeight} kg × {activeReps}
              </Text>
              <Text style={[styles.e1rmText, { color: colors.muted }]}>
                Estimated 1RM{' '}
                <Text style={{ color: colors.ink, fontWeight: '600' }}>
                  {activeE1rm} kg
                </Text>{' '}
                · set {new Date(activeRec.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>

              <View style={{ marginTop: 12 }}>
                <LineChart
                  points={[{ label: 'PR', value: activeWeight }]}
                  ariaLabel={`${activeRec.exerciseName} top set trend`}
                  height={130}
                  formatValue={(v) => `${v} kg`}
                  strokeColor={colors.accent}
                />
              </View>

              <Text style={[styles.formulaNote, { color: colors.muted }]}>
                Estimated 1RM uses the Epley formula — a guide, not a tested max.
              </Text>
            </View>

            {/* All Lifts List */}
            <View style={styles.liftsList}>
              {records.map((r, idx) => {
                const isSelected = r.exerciseName === selectedLift;
                const rWeight = r.weightKg ?? r.value ?? 0;
                const rReps = r.reps ?? 1;

                return (
                  <TouchableOpacity
                    key={r.exerciseId}
                    activeOpacity={0.7}
                    onPress={() => setSelectedLift(r.exerciseName)}
                    style={[
                      styles.liftRow,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                    ]}
                  >
                    <Trophy
                      size={18}
                      color={isSelected ? colors.accent : colors.muted}
                    />
                    <View style={styles.liftTextCol}>
                      <Text
                        style={[
                          styles.rowLiftName,
                          {
                            color: colors.ink,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {r.exerciseName}
                      </Text>
                      <Text style={[styles.rowLiftBest, { color: colors.muted }]}>
                        {rWeight} kg × {rReps} · {new Date(r.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>

                    <Sparkline
                      points={[rWeight]}
                      strokeColor={colors.ink}
                      width={64}
                      height={28}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 20,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  liftName: {
    fontSize: 13,
  },
  liftBest: {
    fontSize: 32,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginTop: 2,
  },
  e1rmText: {
    fontSize: 13,
    marginTop: 4,
  },
  formulaNote: {
    fontSize: 11.5,
    marginTop: 10,
  },
  liftsList: {
    marginTop: 4,
  },
  liftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  liftTextCol: {
    flex: 1,
  },
  rowLiftName: {
    fontSize: 15,
  },
  rowLiftBest: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
});

