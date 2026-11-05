import React, { useState } from 'react';
import { PencilIcon, SparklesIcon, TargetIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { Button } from '../../../shared/components/ui/Button';
import { Badge } from '../../../shared/components/ui/Badge';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { showToast } from '../../../shared/stores/toastStore';
import { goalProgress, useGoalsStore } from '../store/goalsStore';

const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export function GoalDetailScreen() {
  const { id } = useRouteParams();
  const { navigate, goBack } = useNavigation();
  const { goals, deleteGoal, completeGoal, addGoal } = useGoalsStore();
  const goal = goals.find((g) => g.id === id);
  const [confirm, setConfirm] = useState<'delete' | 'complete' | null>(null);

  if (!goal) {
    return (
      <Screen title="Goal">
        <EmptyState icon={TargetIcon} title="Goal not found" body="It may have been deleted." actionLabel="All goals" onAction={goBack} />
      </Screen>);

  }

  const p = goalProgress(goal);
  const done = goal.status === 'completed';
  const points = goal.history.map((v, i) => ({ label: goal.cadence === 'once' ? `W${i + 1}` : days[i] ?? `${i + 1}`, value: v }));

  return (
    <Screen
      title={done ? 'Completed goal' : 'Goal'}
      headerRight={!done ? <IconButton icon={PencilIcon} label="Edit goal" onClick={() => navigate('goalCreate', { id: goal.id })} /> : undefined}
      footer={!done ?
      <Button size="lg" fullWidth variant="secondary" onClick={() => navigate('coach', { q: `How do I stay on track for "${goal.title}"?` })} icon={SparklesIcon}>Ask coach about this goal</Button> :
      undefined}>
      
      <section className="flex items-center gap-5 px-5">
        <ProgressRing size={112} stroke={11} value={p} className="stroke-accentStrong" label={`${Math.round(p * 100)}% complete`}>
          <span className="font-mono text-[24px] font-semibold text-ink">{Math.round(p * 100)}%</span>
        </ProgressRing>
        <div className="min-w-0">
          {done ? <Badge tone="good">Completed {goal.completedOn}</Badge> : <Badge tone="neutral">{goal.deadline === 'Ongoing' ? 'Ongoing' : `By ${goal.deadline}`}</Badge>}
          <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{goal.title}</h1>
          <p className="mt-1 font-mono text-[13px] text-muted">
            {goal.cadence === 'once' ? `${goal.start} → ${goal.current} → ${goal.target} ${goal.unit}` : `Today ${goal.current} / ${goal.target} ${goal.unit}`}
          </p>
        </div>
      </section>

      <section className="mx-4 mt-6 rounded-3xl border border-line bg-surface p-4" aria-label="Progress history">
        <h2 className="px-1 text-[15px] font-semibold text-ink">{goal.cadence === 'daily' ? 'Last 7 days' : 'Progress over time'}</h2>
        <div className="mt-2">
          {goal.cadence === 'daily' ?
          <BarChart data={points} goal={goal.target} ariaLabel={`${goal.title} last 7 days`} barClassName="bg-accentStrong" height={120} formatValue={(v) => `${v.toLocaleString()} ${goal.unit}`} /> :

          <LineChart points={points} target={goal.target} targetLabel={`Target ${goal.target}`} ariaLabel={`${goal.title} history`} height={150} formatValue={(v) => `${v} ${goal.unit}`} />
          }
        </div>
        {goal.cadence === 'daily' && <p className="mt-2 px-1 text-[12.5px] text-muted">Hit on {goal.hitDays ?? 0} of the last 7 days</p>}
      </section>

      {!done &&
      <section className="mx-4 mt-3 rounded-3xl bg-hero p-5 text-heroInk" aria-label="AI forecast">
          <p className="flex items-center gap-1.5 text-[12.5px] text-heroMuted"><SparklesIcon size={13} className="text-accent" aria-hidden="true" /> Forecast · estimate, not a guarantee</p>
          <p className="mt-2 text-[15px] leading-snug">
            {goal.type === 'weightLoss' ?
          'At your 6-week pace (−0.45 kg/wk) you’d reach 75 kg around Dec 14 — likely range Dec 2 to Jan 8.' :
          goal.cadence === 'daily' ?
          'You’re hitting this most on training days. Rest days are where it slips.' :
          `${goal.target - goal.current} more to go. Keep today’s session to stay on track.`}
          </p>
        </section>
      }

      <div className="mt-6 space-y-2 px-4">
        {!done && <Button fullWidth variant="outline" onClick={() => setConfirm('complete')}>Mark as complete</Button>}
        <Button fullWidth variant="danger" onClick={() => setConfirm('delete')}>Delete goal</Button>
      </div>

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this goal?"
        message="Its history will be removed. Your coach will stop planning around it."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const copy = { ...goal };
          deleteGoal(goal.id);
          setConfirm(null);
          goBack();
          showToast({ message: 'Goal deleted', actionLabel: 'Undo', onAction: () => addGoal(copy) });
        }} />
      
      <ConfirmDialog
        open={confirm === 'complete'}
        title="Mark as complete?"
        message="It will move to Completed goals. You can create a new one anytime."
        confirmLabel="Complete"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          completeGoal(goal.id);
          setConfirm(null);
          showToast({ message: 'Goal completed — nice work.' });
        }} />
      
    </Screen>);

}