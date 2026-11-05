import React, { useState } from 'react';
import { CheckCircle2Icon, PlusIcon, TargetIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { goalProgress, useGoalsStore } from '../store/goalsStore';
import { goalTypeMeta } from '../constants/goalTypes';
import type { Goal } from '../types/goal';

export function GoalsScreen() {
  const { navigate } = useNavigation();
  const goals = useGoalsStore((s) => s.goals);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const list = goals.filter((g) => g.status === tab);
  const [primary, ...rest] = list;

  return (
    <Screen title="Goals" headerRight={<IconButton icon={PlusIcon} label="Create goal" onClick={() => navigate('goalCreate')} />}>
      <div className="px-4">
        <SegmentedControl
          label="Goal status"
          options={[{ value: 'active', label: `Active · ${goals.filter((g) => g.status === 'active').length}` }, { value: 'completed', label: `Completed · ${goals.filter((g) => g.status === 'completed').length}` }]}
          value={tab}
          onChange={setTab} />
        
      </div>

      {list.length === 0 ?
      <EmptyState
        icon={tab === 'active' ? TargetIcon : CheckCircle2Icon}
        title={tab === 'active' ? 'No active goals' : 'Nothing completed yet'}
        body={tab === 'active' ? 'Set a goal and your coach will tailor workouts, meals and reminders around it.' : 'Completed goals land here with the date you hit them.'}
        actionLabel={tab === 'active' ? 'Create a goal' : undefined}
        onAction={tab === 'active' ? () => navigate('goalCreate') : undefined} /> :


      <div className="mt-4 space-y-3 px-4">
          {tab === 'active' && primary && <PrimaryGoal goal={primary} onOpen={() => navigate('goalDetail', { id: primary.id })} />}
          <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {(tab === 'active' ? rest : list).map((g) =>
          <li key={g.id}><GoalRow goal={g} onOpen={() => navigate('goalDetail', { id: g.id })} /></li>
          )}
          </ul>
        </div>
      }
    </Screen>);

}

function PrimaryGoal({ goal, onOpen }: {goal: Goal;onOpen: () => void;}) {
  const p = goalProgress(goal);
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-[28px] bg-hero p-5 text-left text-heroInk">
      <span className="text-[12px] text-heroMuted">Main goal · by {goal.deadline}</span>
      <span className="mt-1 block text-[22px] font-semibold tracking-[-0.02em]">{goal.title}</span>
      <span className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-[36px] font-semibold leading-none tracking-[-0.04em]">{goal.current}</span>
        <span className="text-[14px] text-heroMuted">{goal.unit} now · {Math.abs(goal.current - goal.target).toFixed(1)} {goal.unit} to go</span>
      </span>
      <span className="mt-4 block h-2 overflow-hidden rounded-full bg-heroInk/10" role="progressbar" aria-label="Goal progress" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span className="block h-full rounded-full bg-accent" style={{ width: `${p * 100}%` }} />
      </span>
      <span className="mt-2 block text-[12.5px] text-heroMuted">{Math.round(p * 100)}% · started at {goal.start} {goal.unit}</span>
    </button>);

}

function GoalRow({ goal, onOpen }: {goal: Goal;onOpen: () => void;}) {
  const meta = goalTypeMeta[goal.type];
  const Icon = meta.icon;
  const p = goalProgress(goal);
  const done = goal.status === 'completed';
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface2/60">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-accent text-accentInk' : 'bg-surface2 text-ink'}`}>
        {done ? <CheckCircle2Icon size={18} aria-hidden="true" /> : <Icon size={18} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">{goal.title}</span>
          <span className="shrink-0 font-mono text-[12.5px] text-muted">
            {done ? goal.completedOn : goal.cadence === 'daily' ? `${goal.hitDays ?? 0}/7 days` : `${goal.current}/${goal.target}`}
          </span>
        </span>
        {!done && <ProgressBar value={p} max={1} label={`${goal.title} progress`} barClassName="bg-accentStrong" className="mt-2 h-1.5" />}
        {done && <span className="text-[12.5px] text-muted">Completed · {goal.current} {goal.unit}</span>}
      </span>
    </button>);

}