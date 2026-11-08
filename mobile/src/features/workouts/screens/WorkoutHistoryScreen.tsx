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

const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WorkoutHistoryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { history, todayStatus, loadHistoryFromBackend } = useWorkoutStore();

  React.useEffect(() => {
    loadHistoryFromBackend();
  }, [loadHistoryFromBackend]);

  const [now] = React.useState(() => new Date());
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayDay = now.getDate();

  const monthName = React.useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now),
    [now]
  );
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayWeekday = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;

  const daysSet = new Set<number>();
  history.forEach((h) => {
    const dt = new Date(h.date || (h as any).startedAt || (h as any).completedAt);
    if (!isNaN(dt.getTime()) && dt.getFullYear() === currentYear && dt.getMonth() === currentMonth) {
      daysSet.add(dt.getDate());
    }
  });
  if (todayStatus === 'completed') {
    daysSet.add(todayDay);
  }
  const trainedDays = Array.from(daysSet);

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
              {monthName}
            </Text>
            <Text style={[styles.calSub, { color: colors.muted }]}>
              {trainedDays.length} {trainedDays.length === 1 ? 'workout' : 'workouts'}
            </Text>
          </View>

          <View style={styles.calGrid}>
            {days.map((d, i) => (
              <Text key={`head-${i}`} style={[styles.dayHead, { color: colors.muted }]}>
                {d}
              </Text>
            ))}

            {Array.from({ length: firstDayWeekday }).map((_, i) => (
              <View key={`pad-${i}`} style={styles.dayCell} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const isTrained = trainedDays.includes(d);
              const isToday = d === todayDay;

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
                            : d > todayDay
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

