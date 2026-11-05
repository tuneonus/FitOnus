import React from 'react';
import { CircleCheckIcon, FlameIcon, PlayIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { Button } from '../../../shared/components/ui/Button';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../../workouts/store/workoutStore';
import { exerciseById } from '../../workouts/data/workoutsMock';

export function RecommendedWorkout() {
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const { plannedSession, todayStatus, history } = useWorkoutStore();
  const preview = plannedSession.exercises.slice(0, 3);
  const remaining = plannedSession.exercises.length - preview.length;
  const completedLog = todayStatus === 'completed' ? history[0] : null;

  return (
    <section aria-labelledby="workout-title" className="px-4">
      <SectionHeader id="workout-title" title="Today’s training" action="Workouts" onAction={() => navigate('workouts')} />
      <div className="rounded-3xl border border-line bg-surface p-5">
        <button
          type="button"
          onClick={() => navigate('workoutPlan')}
          className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 rounded-xl">
          
          <span className="block text-[12px] font-medium text-muted">{plannedSession.focus}</span>
          <span className="mt-1 block text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {plannedSession.title}
          </span>
          <span className="mt-1 block text-[13px] text-muted">
            {plannedSession.durationMin} min · {plannedSession.exercises.length} exercises · {plannedSession.intensity}
          </span>
        </button>

        <p className="mt-4 flex gap-2 rounded-2xl bg-surface2 p-3 text-[13px] leading-snug text-ink">
          <SparklesIcon size={15} className="mt-0.5 shrink-0 text-accentStrong" aria-hidden="true" />
          <span>
            {hasDevice ?
            'Recovery 84 supports heavier pressing, and your last chest session was Monday.' :
            'Scheduled from your plan. Connect a wearable so I can adapt intensity to your recovery.'}
          </span>
        </p>

        <ol className="mt-4 divide-y divide-line">
          {preview.map((p) =>
          <li key={p.exerciseId}>
              <button
              type="button"
              onClick={() => navigate('exerciseDetail', { id: p.exerciseId })}
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:bg-surface2">
              
                <span className="truncate text-[14px] text-ink">{exerciseById(p.exerciseId).name}</span>
                <span className="shrink-0 font-mono text-[12.5px] text-muted">
                  {p.sets} × {p.reps}
                  {p.weight ? ` · ${p.weight} kg` : ''}
                </span>
              </button>
            </li>
          )}
          {remaining > 0 &&
          <li>
              <button type="button" onClick={() => navigate('workoutPlan')} className="pt-2.5 text-[13px] text-muted hover:text-ink">
                +{remaining} more exercises
              </button>
            </li>
          }
        </ol>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          {completedLog ?
          <>
              <div>
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-good">
                  <CircleCheckIcon size={14} aria-hidden="true" /> Completed
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {completedLog.durationMin} min · {completedLog.sets} sets
                </p>
              </div>
              <Button variant="secondary" onClick={() => navigate('workoutHistoryDetail', { id: completedLog.id })}>
                View summary
              </Button>
            </> :

          <>
              <div>
                <p className="text-[13px] font-medium text-ink">{todayStatus === 'inProgress' ? 'In progress' : 'Not started'}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
                  <FlameIcon size={13} className="text-move" aria-hidden="true" />
                  4-day streak
                </p>
              </div>
              <Button size="lg" icon={PlayIcon} onClick={() => navigate('activeWorkout')}>
                {todayStatus === 'inProgress' ? 'Resume' : 'Start workout'}
              </Button>
            </>
          }
        </div>
      </div>
    </section>);

}