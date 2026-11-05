import React, { useState } from 'react';
import { ChevronRightIcon, PlayIcon, PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { showToast } from '../../../shared/stores/toastStore';
import { exerciseById } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';

export function WorkoutPlanScreen() {
  const { navigate } = useNavigation();
  const { plannedSession, removePlannedExercise, setPlannedSession, todayStatus } = useWorkoutStore();
  const [editing, setEditing] = useState(false);

  const remove = (id: string) => {
    const before = plannedSession;
    removePlannedExercise(id);
    showToast({ message: `${exerciseById(id).name} removed`, actionLabel: 'Undo', onAction: () => setPlannedSession(before) });
  };

  return (
    <Screen
      title="Workout"
      headerRight={
      <button type="button" onClick={() => setEditing((e) => !e)} className="h-11 px-3 text-[15px] font-semibold text-ink">
          {editing ? 'Done' : 'Customize'}
        </button>
      }
      footer={
      <Button size="lg" fullWidth icon={PlayIcon} disabled={todayStatus === 'completed' || plannedSession.exercises.length === 0} onClick={() => navigate('activeWorkout')}>
          {todayStatus === 'inProgress' ? 'Resume workout' : todayStatus === 'completed' ? 'Completed today' : 'Start workout'}
        </Button>
      }>
      
      <div className="px-5 pt-1">
        <p className="text-[13px] font-medium text-muted">{plannedSession.focus}</p>
        <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.03em] text-ink">{plannedSession.title}</h1>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-4">
          {[
          ['Duration', `${plannedSession.durationMin} min`],
          ['Exercises', String(plannedSession.exercises.length)],
          ['Sets', String(plannedSession.exercises.reduce((s, e) => s + e.sets, 0))]].
          map(([l, v]) =>
          <div key={l}>
              <dt className="text-[12px] text-muted">{l}</dt>
              <dd className="font-mono text-[18px] font-semibold text-ink">{v}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 flex gap-2 rounded-2xl bg-surface2 p-3.5 text-[13.5px] leading-snug text-ink">
          <SparklesIcon size={15} className="mt-0.5 shrink-0 text-accentStrong" aria-hidden="true" />
          Progression: bench target is 72.5 kg. If all 4 sets hit 8 reps, I’ll suggest 75 kg next session.
        </p>
      </div>

      <ol className="mt-5 space-y-2 px-4">
        {plannedSession.exercises.map((p, i) => {
          const ex = exerciseById(p.exerciseId);
          return (
            <li key={p.exerciseId} className="flex items-center gap-2 rounded-2xl border border-line bg-surface">
              <button type="button" onClick={() => navigate('exerciseDetail', { id: p.exerciseId })} className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface2 font-mono text-[13px] font-semibold text-ink">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{ex.name}</span>
                  <span className="block font-mono text-[12.5px] text-muted">
                    {p.sets} × {p.reps}{p.weight ? ` · ${p.weight} kg` : ' · BW'} · rest {p.restSec}s
                  </span>
                </span>
                {!editing && <ChevronRightIcon size={16} className="text-muted" aria-hidden="true" />}
              </button>
              {editing &&
              <button type="button" onClick={() => remove(p.exerciseId)} aria-label={`Remove ${ex.name}`} className="mr-2 flex h-11 w-11 items-center justify-center rounded-full text-bad hover:bg-bad/10">
                  <Trash2Icon size={18} aria-hidden="true" />
                </button>
              }
            </li>);

        })}
      </ol>
      {editing &&
      <div className="px-4 pt-3">
          <Button variant="outline" fullWidth icon={PlusIcon} onClick={() => navigate('exerciseLibrary', { pick: '1' })}>Add exercise</Button>
        </div>
      }
    </Screen>);

}