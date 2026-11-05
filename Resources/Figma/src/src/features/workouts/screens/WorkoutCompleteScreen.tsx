import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrophyIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { showToast } from '../../../shared/stores/toastStore';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../store/workoutStore';
import type { WorkoutLog } from '../types/workout';

const feelings = ['Easy', 'Solid', 'Hard', 'Max effort'];

/** Shown only when the screen is opened directly (e.g. a canvas preview) without a just-finished session. */
const previewSession: WorkoutLog = {
  id: 'preview',
  date: 'Today',
  title: 'Chest + Triceps',
  durationMin: 52,
  volumeKg: 10480,
  sets: 19,
  prs: 1,
  calories: 402,
  avgHr: 122,
  source: 'FitOnus',
  exercises: [
  { name: 'Barbell Bench Press', best: '72.5 kg × 6 · PR' },
  { name: 'Incline Dumbbell Press', best: '26 kg × 10' },
  { name: 'Cable Crossover', best: '15 kg × 12' }]

};

export function WorkoutCompleteScreen() {
  const { reset } = useNavigation();
  const { lastCompleted: finished, saveCompleted } = useWorkoutStore();
  const lastCompleted = finished ?? previewSession;
  const hasDevice = useHasDeviceData();
  const [feel, setFeel] = useState('Solid');
  const [discard, setDiscard] = useState(false);

  const stats = [
  { label: 'Duration', value: `${lastCompleted.durationMin}`, unit: 'min' },
  { label: 'Volume', value: lastCompleted.volumeKg.toLocaleString(), unit: 'kg' },
  { label: 'Sets', value: `${lastCompleted.sets}`, unit: '' },
  { label: 'Calories', value: `${lastCompleted.calories}`, unit: 'kcal' }];


  const save = () => {
    if (finished) saveCompleted();else
    useWorkoutStore.getState().logExternal({ ...previewSession, id: `w-${Date.now()}` });
    showToast({ message: 'Workout saved · streak now 5 days' });
    reset('home');
  };

  return (
    <div className="flex h-full flex-col bg-hero text-heroInk">
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6 pt-16">
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="text-[14px] font-medium text-accent">
          Workout complete
        </motion.p>
        <h1 className="mt-1 text-[32px] font-semibold tracking-[-0.03em]">{lastCompleted.title}</h1>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-heroInk/10">
          {stats.map((s) =>
          <div key={s.label} className="bg-hero p-4">
              <dt className="text-[12px] text-heroMuted">{s.label}</dt>
              <dd className="mt-1 font-mono text-[26px] font-semibold tracking-[-0.03em]">
                {s.value}<span className="ml-1 font-sans text-[13px] font-normal text-heroMuted">{s.unit}</span>
              </dd>
            </div>
          )}
        </dl>
        <div className="mt-2">
          <SourceTag tone="hero" source={hasDevice ? { kind: 'synced', label: 'Calories & HR from Apple Watch' } : { kind: 'estimated', label: 'Calories estimated from volume & body weight' }} />
        </div>

        {lastCompleted.prs > 0 ?
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-accent/15 p-4">
            <TrophyIcon size={22} className="text-accent" aria-hidden="true" />
            <p className="text-[14px]"><span className="font-semibold">New PR:</span> Bench press 75 kg</p>
          </div> :

        <p className="mt-5 rounded-2xl bg-heroInk/[0.06] p-4 text-[14px] text-heroMuted">
            No new records today — volume was within 4% of Monday. Consistency like this is what drives PRs.
          </p>
        }

        <h2 className="mt-6 text-[14px] font-semibold">Exercises</h2>
        <ul className="mt-2 divide-y divide-heroInk/10">
          {lastCompleted.exercises.map((e) =>
          <li key={e.name} className="flex justify-between gap-3 py-2.5 text-[14px]">
              <span className="truncate">{e.name}</span>
              <span className="shrink-0 font-mono text-heroMuted">{e.best}</span>
            </li>
          )}
        </ul>

        <fieldset className="mt-6">
          <legend className="text-[14px] font-semibold">How did it feel?</legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {feelings.map((f) =>
            <button
              key={f}
              type="button"
              aria-pressed={feel === f}
              onClick={() => setFeel(f)}
              className={`h-11 rounded-2xl text-[13px] font-medium transition-colors duration-150 ${feel === f ? 'bg-accent text-accentInk' : 'bg-heroInk/[0.08] text-heroInk'}`}>
              
                {f}
              </button>
            )}
          </div>
        </fieldset>
      </div>
      <div className="shrink-0 space-y-2 px-5 pb-8 pt-3">
        <Button size="lg" fullWidth onClick={save}>Save workout</Button>
        <button type="button" onClick={() => setDiscard(true)} className="h-11 w-full text-[15px] font-semibold text-heroMuted">Discard</button>
      </div>
      <ConfirmDialog
        open={discard}
        title="Discard this workout?"
        message="Sets and duration won’t be saved, and your streak won’t update."
        confirmLabel="Discard"
        destructive
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          useWorkoutStore.setState({ todayStatus: 'notStarted', active: [], elapsedSec: 0, lastCompleted: null });
          reset('home');
        }} />
      
    </div>);

}