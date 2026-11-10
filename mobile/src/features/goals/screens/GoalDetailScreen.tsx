import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Pencil, Sparkles, Target } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { IconButton } from '@/shared/components/ui/IconButton';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { ProgressRing } from '@/shared/components/charts/ProgressRing';
import { LineChart } from '@/shared/components/charts/LineChart';
import { BarChart } from '@/shared/components/charts/BarChart';
import { showToast } from '@/shared/stores/toastStore';
import { goalProgress, useGoalsStore } from '../store/goalsStore';
import { useTheme } from '@/hooks/use-theme';

export function GoalDetailScreen() {
  const { colors } = useTheme();
  const params = useRouteParams<{ id?: string }>();
  const id = params.id;
  const { navigate, goBack } = useNavigation();
  const { goals, deleteGoal, completeGoal, addGoal, fetchGoalDetails, activeGoalDetails } =
    useGoalsStore();
  const goal = goals.find((g) => g.id === id);
  const [confirm, setConfirm] = useState<'delete' | 'complete' | null>(null);

  useEffect(() => {
    if (id) {
      fetchGoalDetails(id);
    }
  }, [id, fetchGoalDetails]);

  if (!goal) {
    return (
      <Screen title="Goal">
        <EmptyState
          icon={Target}
          title="Goal not found"
          body="It may have been deleted."
          actionLabel="All goals"
          onAction={goBack}
        />
      </Screen>
    );
  }

  const p = goalProgress(goal);
  const done = goal.status === 'completed';
  const historyData =
    activeGoalDetails?.goal?.id === goal.id && activeGoalDetails.recentHistory?.length
      ? activeGoalDetails.recentHistory
      : goal.history;

  const points = historyData.map((v, i) => ({
    label: `${i + 1}`,
    value: v,
  }));

  return (
    <Screen
      title={done ? 'Completed goal' : 'Goal'}
      headerRight={
        !done ? (
          <IconButton
            icon={Pencil}
            label="Edit goal"
            onPress={() => navigate('goalCreate', { id: goal.id })}
          />
        ) : undefined
      }
      footer={
        !done ? (
          <Button
            size="lg"
            fullWidth
            variant="secondary"
            onPress={() => navigate('coach', { q: `How do I stay on track for "${goal.title}"?` })}
            icon={Sparkles}
          >
            Ask coach about this goal
          </Button>
        ) : undefined
      }
      contentContainerStyle={styles.container}
    >
      {/* Top Summary Card */}
      <View style={styles.summaryRow}>
        <ProgressRing
          size={112}
          strokeWidth={11}
          value={p}
          color={colors.accent}
          trackColor={colors.surface2}
        >
          <View style={styles.ringCenter}>
            <Text style={[styles.ringNumber, { color: colors.ink }]}>{Math.round(p * 100)}%</Text>
          </View>
        </ProgressRing>

        <View style={styles.summaryDetails}>
          {done ? (
            <Badge tone="good">{`Completed ${goal.completedOn ?? ''}`}</Badge>
          ) : (
            <Badge tone="neutral">
              {goal.deadline === 'Ongoing' ? 'Ongoing' : `By ${goal.deadline}`}
            </Badge>
          )}
          <Text style={[styles.goalTitle, { color: colors.ink }]}>{goal.title}</Text>
          <Text style={[styles.goalNumbers, { color: colors.muted }]}>
            {goal.cadence === 'once'
              ? `${goal.start} → ${goal.current} → ${goal.target} ${goal.unit}`
              : `Today ${goal.current} / ${goal.target} ${goal.unit}`}
          </Text>
        </View>
      </View>

      {/* Progress History Card */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>
          {goal.cadence === 'daily' ? 'Last 7 days' : 'Progress over time'}
        </Text>
        <View style={{ marginTop: 8 }}>
          {goal.cadence === 'daily' ? (
            <BarChart
              data={points}
              goal={goal.target}
              barColor={colors.accent}
              height={120}
              formatValue={(v) => `${v.toLocaleString()} ${goal.unit}`}
            />
          ) : (
            <LineChart
              points={points}
              target={goal.target}
              targetLabel={`Target ${goal.target}`}
              height={150}
              strokeColor={colors.accent}
              formatValue={(v) => `${v} ${goal.unit}`}
            />
          )}
        </View>
        {goal.cadence === 'daily' && (
          <Text style={[styles.footnote, { color: colors.muted }]}>
            Hit on {goal.hitDays ?? 0} of the last 7 days
          </Text>
        )}
      </View>

      {/* AI Forecast Card */}
      {!done && (
        <View style={[styles.forecastCard, { backgroundColor: colors.surface2 }]}>
          <View style={styles.forecastHeader}>
            <Sparkles size={13} color={colors.accent} />
            <Text style={[styles.forecastLabel, { color: colors.muted }]}>Goal progress</Text>
          </View>
          <Text style={[styles.forecastText, { color: colors.ink }]}>
            {goal.type === 'weightLoss'
              ? `Your target is ${goal.target} ${goal.unit} by ${goal.deadline}.`
              : goal.cadence === 'daily'
                ? 'Log consistently to track your progress toward this daily goal.'
                : `${Math.abs(goal.target - goal.current).toFixed(1)} ${goal.unit} to go. Keep going to stay on track.`}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsBlock}>
        {!done && (
          <Button fullWidth variant="outline" onPress={() => setConfirm('complete')}>
            Mark as complete
          </Button>
        )}
        <Button fullWidth variant="danger" onPress={() => setConfirm('delete')}>
          Delete goal
        </Button>
      </View>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this goal?"
        message="Its history will be removed. Your coach will stop planning around it."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const copy = { ...goal };
          await deleteGoal(goal.id);
          setConfirm(null);
          goBack();
          showToast({
            message: 'Goal deleted',
            actionLabel: 'Undo',
            onAction: () => addGoal(copy),
          });
        }}
      />

      {/* Complete confirmation dialog */}
      <ConfirmDialog
        open={confirm === 'complete'}
        title="Mark as complete?"
        message="It will move to Completed goals. You can create a new one anytime."
        confirmLabel="Complete"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await completeGoal(goal.id);
          setConfirm(null);
          showToast({ message: 'Goal completed — nice work.' });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNumber: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  summaryDetails: {
    flex: 1,
    gap: 6,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  goalNumbers: {
    fontSize: 13,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12,
    marginTop: 6,
  },
  forecastCard: {
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  forecastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  forecastLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  forecastText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  actionsBlock: {
    gap: 10,
    marginTop: 8,
  },
});
