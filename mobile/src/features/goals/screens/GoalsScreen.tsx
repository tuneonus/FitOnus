import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { CheckCircle2, Plus, Target } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { IconButton } from '@/shared/components/ui/IconButton';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { goalProgress, useGoalsStore } from '../store/goalsStore';
import { goalTypeMeta } from '../constants/goalTypes';
import { useTheme } from '@/hooks/use-theme';
import type { Goal } from '../types/goal';

export function GoalsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const goals = useGoalsStore((s) => s.goals);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const list = goals.filter((g) => g.status === tab);
  const [primary, ...rest] = list;

  return (
    <Screen
      title="Goals"
      headerRight={
        <IconButton icon={Plus} label="Create goal" onPress={() => navigate('goalCreate')} />
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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

        {list.length === 0 ? (
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
          </View>
        )}
      </ScrollView>
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
  const meta = goalTypeMeta[goal.type];
  const Icon = meta.icon;
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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
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
});

