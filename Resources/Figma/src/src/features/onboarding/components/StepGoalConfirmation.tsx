import React from 'react';
import { InfoIcon, PencilIcon } from 'lucide-react';
import { useProfileSetupStore } from '../store/profileSetupStore';
import { experienceLevels, fitnessGoals } from '../constants/options';

type StepGoalConfirmationProps = {onEdit: (stepId: string) => void;};

export function StepGoalConfirmation({ onEdit }: StepGoalConfirmationProps) {
  const s = useProfileSetupStore();
  const goal = fitnessGoals.find((g) => g.value === s.goal);
  const exp = experienceLevels.find((e) => e.value === s.experience);
  const target = s.goal === 'lose' ? 75 : s.goal === 'gain' ? s.weightKg + 4 : s.weightKg;

  const rows = [
  { label: 'Goal', value: goal?.label ?? '—', step: 'goal' },
  { label: 'Target', value: s.goal === 'lose' || s.goal === 'gain' ? `${target.toFixed(1)} kg` : 'Keep within ±1 kg', step: 'weight' },
  { label: 'Training', value: `${s.daysPerWeek}× / week · ${s.durationMin} min`, step: 'workoutPreference' },
  { label: 'Level', value: exp?.label ?? '—', step: 'experience' },
  { label: 'Eating style', value: s.diet === 'none' ? 'No preference' : s.diet.charAt(0).toUpperCase() + s.diet.slice(1), step: 'food' }];


  return (
    <div>
      <div className="rounded-[28px] bg-hero p-5 text-heroInk">
        <p className="text-[13px] text-heroMuted">Your starting plan</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[
          ['2,350', 'kcal / day'],
          ['150 g', 'protein'],
          [`${s.daysPerWeek}`, 'workouts / wk']].
          map(([v, l]) =>
          <div key={l}>
              <p className="font-mono text-[22px] font-semibold tracking-[-0.03em]">{v}</p>
              <p className="text-[12px] text-heroMuted">{l}</p>
            </div>
          )}
        </div>
        {s.goal === 'lose' &&
        <div className="mt-4 border-t border-heroInk/10 pt-4">
            <p className="text-[14px]">
              Projected to reach <span className="font-mono font-semibold">75 kg</span> between{' '}
              <span className="font-semibold text-accent">late Dec and mid Jan</span>.
            </p>
            <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-heroMuted">
              <InfoIcon size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Estimate at ~0.4 kg/week. Real progress varies with adherence, water and sleep.
            </p>
          </div>
        }
      </div>
      <dl className="mt-4 divide-y divide-line rounded-3xl border border-line bg-surface">
        {rows.map((r) =>
        <div key={r.label} className="flex items-center gap-3 px-4 py-3">
            <dt className="w-24 shrink-0 text-[13px] text-muted">{r.label}</dt>
            <dd className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{r.value}</dd>
            <button type="button" onClick={() => onEdit(r.step)} aria-label={`Edit ${r.label}`} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2 hover:text-ink">
              <PencilIcon size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </dl>
    </div>);

}