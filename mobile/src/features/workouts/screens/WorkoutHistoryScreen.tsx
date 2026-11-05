import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Dumbbell, Trophy } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { useWorkoutStore } from '../store/workoutStore';
import { useTheme } from '@/hooks/use-theme';

const octoberWorkoutDays = [1, 3, 5, 6, 8];
const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WorkoutHistoryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { history, todayStatus } = useWorkoutStore();
  const trained =
    todayStatus === 'completed' ? [...octoberWorkoutDays, 9] : octoberWorkoutDays;

  return (
    <Screen
      title="History"
      headerRight={
        <IconButton
          icon={Trophy}
          label="Personal records"
          onPress={() => navigate('personalRecords')}
        />
      }
    >
      <View style={styles.content}>
        {/* Calendar Card */}
        <View
          style={[
            styles.calendarCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <View style={styles.calHeader}>
            <Text style={[styles.calTitle, { color: colors.ink }]}>
              October 2026
            </Text>
            <Text style={[styles.calSub, { color: colors.muted }]}>
              {trained.length} workouts
            </Text>
          </View>

          <View style={styles.calGrid}>
            {days.map((d, i) => (
              <Text key={`head-${i}`} style={[styles.dayHead, { color: colors.muted }]}>
                {d}
              </Text>
            ))}

            {Array.from({ length: 3 }).map((_, i) => (
              <View key={`pad-${i}`} style={styles.dayCell} />
            ))}

            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
              const isTrained = trained.includes(d);
              const isToday = d === 9;

              return (
                <View key={d} style={styles.dayCell}>
                  <View
                    style={[
                      styles.dayCircle,
                      isTrained && {
                        backgroundColor: colors.accent,
                      },
                      isToday && !isTrained && {
                        borderWidth: 2,
                        borderColor: colors.ink,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: isTrained
                            ? colors.accentInk
                            : d > 9
                            ? `${colors.muted}70`
                            : colors.ink,
                          fontWeight: isTrained ? '700' : '400',
                        },
                      ]}
                    >
                      {d}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* History List */}
        {history.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No workouts yet"
            body="Finish your first session and it’ll show up here with sets, volume and PRs."
            actionLabel="Start today’s workout"
            onAction={() => navigate('activeWorkout')}
          />
        ) : (
          <View style={styles.historyList}>
            {history.map((w) => (
              <TouchableOpacity
                key={w.id}
                activeOpacity={0.7}
                onPress={() => navigate('workoutHistoryDetail', { id: w.id })}
                style={[
                  styles.historyCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                  },
                ]}
              >
                <View style={styles.historyTop}>
                  <Text style={[styles.wTitle, { color: colors.ink }]}>
                    {w.title}
                  </Text>
                  <Text style={[styles.wDate, { color: colors.muted }]}>
                    {w.date}
                  </Text>
                </View>
                <Text style={[styles.wStats, { color: colors.muted }]}>
                  {w.durationMin} min
                  {w.volumeKg ? ` · ${w.volumeKg.toLocaleString()} kg` : ''}
                  {w.sets ? ` · ${w.sets} sets` : ''}
                  {w.prs ? ` · ${w.prs} PR` : ''}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <SourceTag
                    source={
                      w.source === 'Apple Watch'
                        ? { kind: 'synced', label: 'Apple Watch workout' }
                        : {
                            kind: 'manual',
                            label: `Logged in ${
                              w.source === 'Manual' ? 'chat' : 'FitOnus'
                            }`,
                          }
                    }
                  />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 20,
    paddingBottom: 32,
  },
  calendarCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  calSub: {
    fontSize: 12,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayHead: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    marginBottom: 8,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  historyTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  wTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  wDate: {
    fontSize: 12,
  },
  wStats: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
});

