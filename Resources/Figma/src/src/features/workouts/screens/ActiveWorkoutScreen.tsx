import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon, PlusIcon, SkipForwardIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { cn } from '../../../shared/utils/cn';
import { exerciseById } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';
import { useRestTimer } from '../hooks/useRestTimer';
import { SetRow } from '../components/SetRow';
import { RestTimer } from '../components/RestTimer';

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function ActiveWorkoutScreen() {
  const { goBack, replace } = useNavigation();
  const store = useWorkoutStore();
  const { active, currentIndex, elapsedSec, paused, plannedSession } = store;
  const restTimer = useRestTimer();
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    store.startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => useWorkoutStore.getState().tick(), 1000);
    return () => clearInterval(t);
  }, []);

  const current = active[currentIndex];
  if (!current) return null;
  const ex = exerciseById(current.exerciseId);
  const doneSets = active.flatMap((e) => e.sets).filter((s) => s.done).length;
  const totalSets = active.filter((e) => !e.skipped).flatMap((e) => e.sets).length;
  const next = active[currentIndex + 1];

  const completeSet = (i: number) => {
    const wasDone = current.sets[i].done;
    store.updateSet(currentIndex, i, { done: !wasDone });
    if (!wasDone) restTimer.start(current.restSec);
  };

  const finish = () => {
    store.finishSession();
    replace('workoutComplete');
  };

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <header className="shrink-0 px-2 pt-12">
        <div className="flex h-12 items-center">
          <button type="button" onClick={goBack} aria-label="Minimize workout" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-ink/[0.06]">
            <ChevronLeftIcon size={24} aria-hidden="true" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[12px] text-muted">{plannedSession.title}</p>
            <p className={cn('font-mono text-[18px] font-semibold', paused ? 'text-warn' : 'text-ink')} role="timer" aria-label="Workout duration">
              {fmt(elapsedSec)}
            </p>
          </div>
          <button type="button" onClick={store.togglePause} aria-label={paused ? 'Resume workout' : 'Pause workout'} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-ink">
            {paused ? <PlayIcon size={18} aria-hidden="true" /> : <PauseIcon size={18} aria-hidden="true" />}
          </button>
        </div>
        <div className="mx-3 mt-2 flex gap-1" aria-label={`Exercise ${currentIndex + 1} of ${active.length}`}>
          {active.map((e, i) => {
            const complete = e.sets.every((s) => s.done);
            return (
              <button
                key={e.exerciseId}
                type="button"
                onClick={() => store.setCurrentIndex(i)}
                aria-label={`Go to ${exerciseById(e.exerciseId).name}`}
                className={cn('h-1.5 flex-1 rounded-full', i === currentIndex ? 'bg-ink' : complete ? 'bg-good' : e.skipped ? 'bg-ink/10' : 'bg-ink/20')} />);


          })}
        </div>
      </header>

      {paused &&
      <div className="mx-4 mt-3 rounded-2xl bg-warn/10 p-3 text-center text-[13.5px] font-medium text-ink" role="status">
          Paused — timer stopped. Tap play to resume.
        </div>
      }

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-32 pt-5">
        <p className="text-[12px] font-medium text-muted">Exercise {currentIndex + 1} of {active.length}{current.skipped && ' · skipped'}</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-[-0.02em] text-ink">{ex.name}</h1>
        <p className="text-[13px] text-muted">Target {current.sets.length} × {current.targetReps} · rest {current.restSec}s</p>

        <div className="mt-4 flex items-center justify-between px-3 text-[11px] font-medium text-muted" aria-hidden="true">
          <span className="w-6">Set</span>
          <span className="flex flex-1 justify-around"><span>Weight</span><span>Reps</span></span>
          <span className="w-10 text-center">Done</span>
        </div>
        <ol className="mt-1.5 space-y-1.5">
          {current.sets.map((s, i) =>
          <SetRow key={i} index={i} set={s} bodyweight={s.weight === 0 && ex.equipment === 'Bodyweight'} onChange={(p) => store.updateSet(currentIndex, i, p)} onComplete={() => completeSet(i)} />
          )}
        </ol>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={PlusIcon} onClick={() => store.addSet(currentIndex)}>Add set</Button>
          <Button
            variant="secondary"
            icon={SkipForwardIcon}
            onClick={() => {
              store.skipExercise(currentIndex);
              if (next) store.setCurrentIndex(currentIndex + 1);
            }}>
            
            Skip exercise
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" icon={ChevronLeftIcon} disabled={currentIndex === 0} onClick={() => store.setCurrentIndex(currentIndex - 1)}>Previous</Button>
          <Button variant="ghost" iconRight={ChevronRightIcon} disabled={!next} onClick={() => store.setCurrentIndex(currentIndex + 1)}>Next</Button>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-[13px] text-muted">Session progress</p>
          <p className="mt-1 font-mono text-[20px] font-semibold text-ink">{doneSets}<span className="text-[14px] text-muted"> / {totalSets} sets</span></p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-bg px-4 pb-8 pt-3">
        <Button size="lg" fullWidth variant="inverse" onClick={() => setConfirmFinish(true)}>Finish workout</Button>
      </div>

      <AnimatePresence>
        {restTimer.rest &&
        <RestTimer
          remaining={restTimer.rest.remaining}
          total={restTimer.rest.total}
          nextLabel={current.sets.every((s) => s.done) && next ? exerciseById(next.exerciseId).name : `Set ${current.sets.filter((s) => s.done).length + 1}`}
          onAdd={() => restTimer.add(15)}
          onSkip={restTimer.skip} />

        }
      </AnimatePresence>

      <ConfirmDialog
        open={confirmFinish}
        title="Finish workout?"
        message={doneSets < totalSets ? `${totalSets - doneSets} sets aren’t marked done. They won’t count toward volume.` : 'Great session. Ready to see your summary?'}
        confirmLabel="Finish"
        cancelLabel="Keep going"
        onCancel={() => setConfirmFinish(false)}
        onConfirm={() => {
          setConfirmFinish(false);
          finish();
        }} />
      
    </div>);

}