import React, { useState } from 'react';
import { RefreshCwIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Chip } from '../../../shared/components/ui/Chip';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { showToast } from '../../../shared/stores/toastStore';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { ThinkingIndicator } from '../../ai-coach/components/ThinkingIndicator';
import { WorkoutBlock } from '../../ai-coach/components/blocks/WorkoutBlock';
import { mockAiTools } from '../../ai-coach/services/mockAiTools';
import { exerciseById } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';
import type { WorkoutSession } from '../types/workout';

const goals = ['Fat Loss', 'Muscle Gain', 'Strength', 'Full Body'];
const durations = [30, 45, 60, 75];
const levels = ['Beginner', 'Intermediate', 'Advanced'];

export function WorkoutGeneratorScreen() {
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const profile = useProfileSetupStore();
  const setPlanned = useWorkoutStore((s) => s.setPlannedSession);
  const [goal, setGoal] = useState('Fat Loss');
  const [duration, setDuration] = useState(45);
  const [level, setLevel] = useState('Intermediate');
  const [equipment, setEquipment] = useState<string[]>(profile.equipment);
  const [phase, setPhase] = useState<'form' | 'generating' | 'result' | 'error'>('form');
  const [result, setResult] = useState<WorkoutSession | null>(null);
  const hasRecovery = status === 'synced';

  const generate = async () => {
    setPhase('generating');
    if (status === 'offline') {
      setTimeout(() => setPhase('error'), 1600);
      return;
    }
    const session = await mockAiTools.createWorkoutPlan({ goal, durationMin: duration, equipment, recovery: hasRecovery ? 84 : undefined });
    setResult({ ...session, durationMin: duration, title: goal === 'Fat Loss' ? session.title : `${goal} Session` });
    setPhase('result');
  };

  const save = () => {
    if (!result) return;
    setPlanned(result);
    showToast({ message: 'Saved as today’s workout' });
    navigate('workoutPlan');
  };

  if (phase === 'generating') {
    return (
      <Screen title="AI plan">
        <div className="px-6 pt-16">
          <SparklesIcon size={28} className="text-accentStrong" aria-hidden="true" />
          <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em] text-ink">Building your {duration}-minute {goal.toLowerCase()} session</h1>
          <div className="mt-6">
            <ThinkingIndicator toolCalls={['getGoals', 'getRecoveryScore', 'getWorkoutHistory', 'createWorkoutPlan']} />
          </div>
        </div>
      </Screen>);

  }

  if (phase === 'result' && result) {
    return (
      <Screen
        title="Your AI plan"
        footer={
        <div className="flex gap-2">
            <Button variant="secondary" size="lg" icon={RefreshCwIcon} onClick={generate}>Regenerate</Button>
            <Button size="lg" className="flex-1" onClick={save}>Use today</Button>
          </div>
        }>
        
        <div className="space-y-4 px-4 pt-2">
          <WorkoutBlock
            block={{
              type: 'workout',
              title: result.title,
              focus: `${goal} · ${level}`,
              durationMin: duration,
              exercises: result.exercises.map((e) => ({ name: exerciseById(e.exerciseId).name, detail: `${e.sets} × ${e.reps}${e.weight ? ` · ${e.weight} kg` : ''}` }))
            }} />
          
          <div className="rounded-2xl bg-surface2 p-4 text-[13.5px] leading-relaxed text-ink">
            <p className="font-semibold">Why this plan</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted">
              <li>{hasRecovery ? 'Recovery 84 supports a moderate–high effort circuit.' : 'No recovery data — kept intensity moderate.'}</li>
              <li>Short 30–45 s rests keep heart rate elevated for fat loss.</li>
              <li>No overhead pressing, based on your shoulder note in memory.</li>
            </ul>
          </div>
        </div>
      </Screen>);

  }

  return (
    <Screen title="Generate plan" footer={<Button size="lg" fullWidth icon={SparklesIcon} onClick={generate} disabled={equipment.length === 0}>Generate workout</Button>}>
      <div className="space-y-6 px-5 pt-2">
        {phase === 'error' && <StatusBanner tone="error" title="Couldn’t generate a plan" body="The AI service didn’t respond. Check your connection and try again." actionLabel="Retry" onAction={generate} />}
        {[
        { label: 'Goal', items: goals, value: goal, set: setGoal },
        { label: 'Experience', items: levels, value: level, set: setLevel }].
        map((g) =>
        <fieldset key={g.label}>
            <legend className="text-[14px] font-semibold text-ink">{g.label}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {g.items.map((i) => <Chip key={i} selected={g.value === i} onClick={() => g.set(i)}>{i}</Chip>)}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend className="text-[14px] font-semibold text-ink">Duration</legend>
          <div className="mt-2 flex gap-2">
            {durations.map((d) => <Chip key={d} selected={duration === d} onClick={() => setDuration(d)}>{d} min</Chip>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-[14px] font-semibold text-ink">Equipment available</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {['Barbell', 'Dumbbells', 'Kettlebells', 'Cable machine', 'Bench', 'Pull-up bar', 'None'].map((e) =>
            <Chip key={e} selected={equipment.includes(e)} onClick={() => setEquipment((l) => l.includes(e) ? l.filter((x) => x !== e) : [...l, e])}>{e}</Chip>
            )}
          </div>
          {equipment.length === 0 && <p className="mt-2 text-[12.5px] text-bad">Pick at least one, or “None” for bodyweight.</p>}
        </fieldset>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[14px] font-semibold text-ink">Recovery input</p>
          {hasRecovery ?
          <>
              <p className="mt-1 text-[13.5px] text-muted"><span className="font-mono font-semibold text-ink">84</span> · Train hard</p>
              <div className="mt-1.5"><SourceTag source={{ kind: 'estimated', label: 'FitOnus model from Apple Watch data' }} /></div>
            </> :

          <p className="mt-1 text-[13.5px] text-muted">Not available — the plan will use moderate intensity.</p>
          }
        </div>
      </div>
    </Screen>);

}