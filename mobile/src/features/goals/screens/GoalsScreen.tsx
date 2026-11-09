import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { CheckCircle2, Circle, Plus, Target, Flame, RefreshCw } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { IconButton } from '@/shared/components/ui/IconButton';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { Button } from '@/shared/components/ui/Button';
import { goalProgress, useGoalsStore } from '../store/goalsStore';
import { goalTypeMeta } from '../constants/goalTypes';
import { useTheme } from '@/hooks/use-theme';
import type { Goal, Habit } from '../types/goal';

export function GoalsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const {
    goals,
    habits,
    isLoading,
    isRefreshing,
    error,
    fetchGoals,
    fetchHabits,
    setHabitCompletion,
  } = useGoalsStore();

  const [tab, setTab] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    fetchGoals();
    fetchHabits();
  }, [fetchGoals, fetchHabits]);

  const onRefresh = useCallback(() => {
    fetchGoals({ force: true });
    fetchHabits();
  }, [fetchGoals, fetchHabits]);

  const list = goals.filter((g) => g.status === tab);
  const [primary, ...rest] = list;

  return (
    <Screen
      title="Goals"
      headerRight={
        <IconButton icon={Plus} label="Create goal" onPress={() => navigate('goalCreate')} />
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <View style={styles.container}>
        <SegmentedControl
          options={[
            {
              value: 'active',
              label: `Active · ${goals.filter((g) => g.status === 'active').length}`,
            },
            {
              value: 'completed',
              label: `Completed · ${goals.filter((g) => g.status === 'completed').length}`,
            },
          ]}
          value={tab}
          onChange={(val) => setTab(val as 'active' | 'completed')}
        />

        {error && goals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Unable to load goals"
            body={error}
            actionLabel="Try again"
            onAction={onRefresh}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === 'active' ? Target : CheckCircle2}
            title={tab === 'active' ? 'No active goals' : 'Nothing completed yet'}
            body={
              tab === 'active'
                ? 'Set a goal and your coach will tailor workouts, meals and reminders around it.'
                : 'Completed goals land here with the date you hit them.'
            }
            actionLabel={tab === 'active' ? 'Create a goal' : undefined}
            onAction={tab === 'active' ? () => navigate('goalCreate') : undefined}
          />
        ) : (
          <View style={styles.goalsContent}>
            {tab === 'active' && primary && (
              <PrimaryGoal
                goal={primary}
                onOpen={() => navigate('goalDetail', { id: primary.id })}
              />
            )}

            <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              {(tab === 'active' ? rest : list).map((g, idx, arr) => (
                <View
                  key={g.id}
                  style={[
                    styles.rowBorder,
                    { borderBottomColor: colors.line },
                    idx === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <GoalRow goal={g} onOpen={() => navigate('goalDetail', { id: g.id })} />
                </View>
              ))}
            </View>

            {/* Daily Habits Section on Active Tab */}
            {tab === 'active' && habits.length > 0 && (
              <View style={styles.habitsSection}>
                <View style={styles.habitsSectionHeader}>
                  <Text style={[styles.habitsSectionTitle, { color: colors.ink }]}>Daily Habits</Text>
                  <Text style={[styles.habitsSectionSub, { color: colors.muted }]}>
                    {habits.filter((h) => h.isCompletedToday).length}/{habits.length} done today
                  </Text>
                </View>

                <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  {habits.map((habit, idx) => (
                    <View
                      key={habit.id}
                      style={[
                        styles.rowBorder,
                        { borderBottomColor: colors.line },
                        idx === habits.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <HabitRow
                        habit={habit}
                        onToggle={() => setHabitCompletion(habit.id, !habit.isCompletedToday)}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

function PrimaryGoal({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const { colors } = useTheme();
  const p = goalProgress(goal);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onOpen}
      style={[styles.primaryCard, { backgroundColor: colors.surface2 }]}
    >
      <Text style={[styles.primaryMeta, { color: colors.muted }]}>
        Main goal · by {goal.deadline}
      </Text>
      <Text style={[styles.primaryTitle, { color: colors.ink }]}>{goal.title}</Text>

      <View style={styles.primaryNumRow}>
        <Text style={[styles.primaryBigNum, { color: colors.ink }]}>{goal.current}</Text>
        <Text style={[styles.primaryNumSub, { color: colors.muted }]}>
          {goal.unit} now · {Math.abs(goal.current - goal.target).toFixed(1)} {goal.unit} to go
        </Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.line }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(100, Math.max(0, p * 100))}%`, backgroundColor: colors.accent },
          ]}
        />
      </View>

      <Text style={[styles.primaryFootnote, { color: colors.muted }]}>
        {Math.round(p * 100)}% · started at {goal.start} {goal.unit}
      </Text>
    </TouchableOpacity>
  );
}

function GoalRow({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const { colors } = useTheme();
  const meta = goalTypeMeta[goal.type] ?? goalTypeMeta.custom;
  const Icon = meta?.icon ?? Target;
  const p = goalProgress(goal);
  const done = goal.status === 'completed';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onOpen}
      style={styles.goalRow}
    >
      <View
        style={[
          styles.goalIconBox,
          {
            backgroundColor: done ? colors.accent : colors.surface2,
          },
        ]}
      >
        {done ? (
          <CheckCircle2 size={18} color={colors.ink} />
        ) : (
          <Icon size={18} color={colors.ink} />
        )}
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.goalRowHeader}>
          <Text style={[styles.goalTitle, { color: colors.ink }]} numberOfLines={1}>
            {goal.title}
          </Text>
          <Text style={[styles.goalStats, { color: colors.muted }]}>
            {done
              ? goal.completedOn
              : goal.cadence === 'daily'
              ? `${goal.hitDays ?? 0}/7 days`
              : `${goal.current}/${goal.target}`}
          </Text>
        </View>

        {!done && (
          <ProgressBar
            value={p}
            max={1}
            color={colors.accent}
            trackColor={colors.surface2}
            style={{ height: 6 }}
          />
        )}
        {done && (
          <Text style={[styles.completedNote, { color: colors.muted }]}>
            Completed · {goal.current} {goal.unit}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function HabitRow({ habit, onToggle }: { habit: Habit; onToggle: () => void }) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onToggle}
      style={styles.habitRow}
    >
      <View style={styles.habitCheckIcon}>
        {habit.isCompletedToday ? (
          <CheckCircle2 size={22} color={colors.accent} />
        ) : (
          <Circle size={22} color={colors.muted} />
        )}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={[
            styles.habitTitle,
            { color: colors.ink },
            habit.isCompletedToday && styles.habitCompletedText,
          ]}
          numberOfLines={1}
        >
          {habit.title}
        </Text>
        <Text style={[styles.habitMeta, { color: colors.muted }]}>
          {habit.frequency === 'daily' ? 'Daily' : `${habit.targetDaysPerWeek}x/week`}
          {habit.currentStreak > 0 && ` · ${habit.currentStreak} day streak`}
        </Text>
      </View>

      {habit.currentStreak > 0 && (
        <View style={[styles.streakBadge, { backgroundColor: colors.surface2 }]}>
          <Flame size={13} color={colors.accent} />
          <Text style={[styles.streakText, { color: colors.ink }]}>{habit.currentStreak}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 32,
    gap: 16,
  },
  goalsContent: {
    gap: 14,
  },
  primaryCard: {
    borderRadius: 28,
    padding: 20,
    gap: 8,
  },
  primaryMeta: {
    fontSize: 12,
  },
  primaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  primaryNumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
  },
  primaryBigNum: {
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  primaryNumSub: {
    fontSize: 13.5,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  primaryFootnote: {
    fontSize: 12.5,
    marginTop: 2,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowBorder: {
    borderBottomWidth: 1,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  goalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  goalStats: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  completedNote: {
    fontSize: 12.5,
  },
  habitsSection: {
    gap: 10,
    marginTop: 8,
  },
  habitsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 4,
  },
  habitsSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  habitsSectionSub: {
    fontSize: 13,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  habitCheckIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  habitCompletedText: {
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  habitMeta: {
    fontSize: 12,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
