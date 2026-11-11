import React, { useState } from 'react';
import {
  ActivityIcon,
  BrainIcon,
  CheckIcon,
  HeartPulseIcon,
  Loader2Icon,
  MoonIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  WatchIcon } from
'lucide-react';
import { OptionCard } from '../../../shared/components/ui/OptionCard';
import { Chip } from '../../../shared/components/ui/Chip';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { TextField } from '../../../shared/components/ui/TextField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { Toggle } from '../../../shared/components/ui/Toggle';
import { Button } from '../../../shared/components/ui/Button';
import { useProfileSetupStore } from '../store/profileSetupStore';
import {
  allergyOptions,
  cuisineOptions,
  dietOptions,
  durationOptions,
  equipmentOptions,
  experienceLevels,
  fitnessGoals,
  workoutPlaces } from
'../constants/options';

export function StepIntro() {
  const items = [
  { icon: BrainIcon, text: 'Your goals and experience shape every plan.' },
  { icon: HeartPulseIcon, text: 'Health data lets the coach read recovery — only if you allow it.' },
  { icon: ShieldCheckIcon, text: 'You can edit or delete anything later.' }];

  return (
    <div>
      <ul className="space-y-4">
        {items.map(({ icon: Icon, text }) =>
        <li key={text} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2">
              <Icon size={19} className="text-ink" aria-hidden="true" />
            </span>
            <p className="pt-2 text-[15px] leading-snug text-ink">{text}</p>
          </li>
        )}
      </ul>
    </div>);

}

export function StepPersonal() {
  const { name, sex, update } = useProfileSetupStore();
  return (
    <div className="space-y-5">
      <TextField label="Your name" value={name} onChange={(e) => update({ name: e.target.value })} autoComplete="name" />
      <div>
        <p className="text-[13px] font-medium text-ink">Sex</p>
        <p className="text-[12.5px] text-muted">Used only to estimate calorie needs.</p>
        <div className="mt-2 space-y-2" role="radiogroup" aria-label="Sex">
          {(
          [
          ['male', 'Male'],
          ['female', 'Female'],
          ['unspecified', 'Prefer not to say']] as
          const).
          map(([value, label]) =>
          <OptionCard key={value} title={label} selected={sex === value} onSelect={() => update({ sex: value })} />
          )}
        </div>
      </div>
    </div>);

}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function StepDob() {
  const { dobDay, dobMonth, dobYear, update } = useProfileSetupStore();
  const age = 2026 - dobYear - (dobMonth > 10 || dobMonth === 10 && dobDay > 9 ? 1 : 0);
  const select = 'h-[52px] w-full appearance-none rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink focus:border-ink focus:outline-none';
  return (
    <div>
      <div className="grid grid-cols-[1fr_1.2fr_1.3fr] gap-2">
        <label className="text-[13px] font-medium text-ink">
          Day
          <select className={`${select} mt-1.5`} value={dobDay} onChange={(e) => update({ dobDay: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <label className="text-[13px] font-medium text-ink">
          Month
          <select className={`${select} mt-1.5`} value={dobMonth} onChange={(e) => update({ dobMonth: Number(e.target.value) })}>
            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
        <label className="text-[13px] font-medium text-ink">
          Year
          <select className={`${select} mt-1.5`} value={dobYear} onChange={(e) => update({ dobYear: Number(e.target.value) })}>
            {Array.from({ length: 70 }, (_, i) => 2010 - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-6 rounded-2xl bg-surface2 p-4 text-center text-[15px] text-ink">
        You’re <span className="font-mono text-[20px] font-semibold">{age}</span> years old
      </p>
    </div>);

}

export function StepHeight() {
  const { heightCm, update } = useProfileSetupStore();
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm');
  const totalIn = heightCm / 2.54;
  return (
    <div>
      <SegmentedControl label="Height unit" options={[{ value: 'cm', label: 'Centimeters' }, { value: 'ft', label: 'Feet & inches' }]} value={unit} onChange={setUnit} />
      <div className="mt-10">
        <Stepper size="lg" label="Height" value={heightCm} onChange={(v) => update({ heightCm: v })} min={120} max={230} unit="cm" />
        {unit === 'ft' &&
        <p className="mt-4 text-center font-mono text-[18px] text-muted">
            {Math.floor(totalIn / 12)}′ {Math.round(totalIn % 12)}″
          </p>
        }
        <input
          type="range"
          min={120}
          max={230}
          value={heightCm}
          onChange={(e) => update({ heightCm: Number(e.target.value) })}
          aria-label="Height slider"
          className="mt-8 w-full accent-[rgb(var(--accent-strong))]" />
        
      </div>
    </div>);

}

export function StepWeight() {
  const { weightKg, heightCm, update } = useProfileSetupStore();
  const bmi = weightKg / (heightCm / 100) ** 2;
  return (
    <div>
      <div className="mt-6">
        <Stepper size="lg" label="Current weight" value={weightKg} onChange={(v) => update({ weightKg: v })} step={0.1} decimals={1} min={35} max={250} unit="kg" />
      </div>
      <input
        type="range"
        min={35}
        max={180}
        step={0.1}
        value={weightKg}
        onChange={(e) => update({ weightKg: Number(e.target.value) })}
        aria-label="Weight slider"
        className="mt-8 w-full accent-[rgb(var(--accent-strong))]" />
      
      <p className="mt-6 rounded-2xl bg-surface2 p-4 text-[13.5px] leading-relaxed text-muted">
        BMI <span className="font-mono font-semibold text-ink">{bmi.toFixed(1)}</span> · calculated, not a health diagnosis. Your coach focuses on trends, not single numbers.
      </p>
    </div>);

}

export function StepExperience() {
  const { experience, update } = useProfileSetupStore();
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Fitness experience">
      {experienceLevels.map((l) =>
      <OptionCard key={l.value} title={l.label} description={l.description} selected={experience === l.value} onSelect={() => update({ experience: l.value })} />
      )}
    </div>);

}

export function StepGoal() {
  const { goal, update } = useProfileSetupStore();
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Fitness goal">
      {fitnessGoals.map((g) =>
      <OptionCard key={g.value} icon={g.icon} title={g.label} description={g.description} selected={goal === g.value} onSelect={() => update({ goal: g.value })} />
      )}
    </div>);

}

export function StepWorkoutPreference() {
  const { place, daysPerWeek, update } = useProfileSetupStore();
  return (
    <div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where you train">
        {workoutPlaces.map(({ value, label, description, icon: Icon }) => {
          const selected = place === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => update({ place: value })}
              className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-colors duration-150 ${selected ? 'border-ink bg-surface' : 'border-line bg-surface'}`}>
              
              <Icon size={22} className={selected ? 'text-accentStrong' : 'text-ink'} aria-hidden="true" />
              <span className="mt-3 text-[15px] font-semibold text-ink">{label}</span>
              <span className="mt-0.5 text-[12.5px] text-muted">{description}</span>
            </button>);

        })}
      </div>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <p className="text-[14px] font-semibold text-ink">Days per week</p>
        <div className="mt-3">
          <Stepper label="Days per week" value={daysPerWeek} onChange={(v) => update({ daysPerWeek: v })} min={1} max={7} unit="days" />
        </div>
      </div>
    </div>);

}

export function StepEquipment() {
  const { equipment, toggleInList } = useProfileSetupStore();
  return (
    <div className="flex flex-wrap gap-2">
      {equipmentOptions.map((e) =>
      <Chip key={e} selected={equipment.includes(e)} onClick={() => toggleInList('equipment', e)}>
          {e}
        </Chip>
      )}
    </div>);

}

export function StepDuration() {
  const { durationMin, update } = useProfileSetupStore();
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Workout duration">
      {durationOptions.map((d) => {
        const selected = durationMin === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => update({ durationMin: d })}
            className={`rounded-2xl border p-5 text-left transition-colors duration-150 ${selected ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink'}`}>
            
            <span className="font-mono text-[32px] font-semibold leading-none tracking-[-0.03em]">{d}</span>
            <span className={`mt-1 block text-[13px] ${selected ? 'text-bg/70' : 'text-muted'}`}>minutes</span>
          </button>);

      })}
    </div>);

}

export function StepFood() {
  const { diet, allergies, cuisines, update, toggleInList } = useProfileSetupStore();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[14px] font-semibold text-ink">Eating style</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {dietOptions.map((d) =>
          <Chip key={d.value} selected={diet === d.value} onClick={() => update({ diet: d.value })}>
              {d.label}
            </Chip>
          )}
        </div>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-ink">Allergies or foods to avoid</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {allergyOptions.map((a) =>
          <Chip key={a} selected={allergies.includes(a)} onClick={() => toggleInList('allergies', a)}>
              {a}
            </Chip>
          )}
        </div>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-ink">Cuisines you enjoy</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {cuisineOptions.map((c) =>
          <Chip key={c} selected={cuisines.includes(c)} onClick={() => toggleInList('cuisines', c)}>
              {c}
            </Chip>
          )}
        </div>
      </div>
    </div>);

}

const permissionItems = [
{ key: 'activity', icon: ActivityIcon, label: 'Activity & workouts', detail: 'Steps, distance, active calories' },
{ key: 'heart', icon: HeartPulseIcon, label: 'Heart', detail: 'Heart rate, resting HR, HRV' },
{ key: 'sleep', icon: MoonIcon, label: 'Sleep', detail: 'Duration and sleep stages' },
{ key: 'body', icon: ScaleIcon, label: 'Body', detail: 'Weight, body fat, BMI' }];


export function StepHealthPermissions() {
  const { healthAllowed, update } = useProfileSetupStore();
  const [toggles, setToggles] = useState<Record<string, boolean>>({ activity: true, heart: true, sleep: true, body: true });
  const [requesting, setRequesting] = useState(false);

  const allow = () => {
    setRequesting(true);
    setTimeout(() => {
      setRequesting(false);
      update({ healthAllowed: true });
    }, 1100);
  };

  return (
    <div>
      <div className="divide-y divide-line rounded-3xl border border-line bg-surface">
        {permissionItems.map(({ key, icon: Icon, label, detail }) =>
        <div key={key} className="flex items-center gap-3 p-4">
            <Icon size={20} className="shrink-0 text-ink" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ink">{label}</p>
              <p className="text-[12.5px] text-muted">{detail}</p>
            </div>
            <Toggle label={label} checked={toggles[key]} onChange={(v) => setToggles((t) => ({ ...t, [key]: v }))} />
          </div>
        )}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        OnusFit reads data only. We never sell health data, and you can revoke access any time in Settings.
      </p>
      {healthAllowed ?
      <p className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-good/10 p-3.5 text-[14px] font-semibold text-good" role="status">
          <CheckIcon size={16} aria-hidden="true" /> Access granted in Apple Health
        </p> :

      <Button variant="inverse" size="lg" fullWidth className="mt-5" loading={requesting} onClick={allow}>
          {requesting ? 'Waiting for Apple Health…' : 'Allow in Apple Health'}
        </Button>
      }
    </div>);

}

const deviceItems = [
{ key: 'watch', icon: WatchIcon, label: 'Apple Watch', detail: 'Heart rate, workouts, sleep' },
{ key: 'hc', icon: SmartphoneIcon, label: 'Health Connect', detail: 'Android: Samsung Health, Fitbit, Garmin…' }];


export function StepDevice() {
  const [state, setState] = useState<Record<string, 'idle' | 'connecting' | 'connected'>>({ watch: 'idle', hc: 'idle' });
  const update = useProfileSetupStore((s) => s.update);

  const connect = (key: string) => {
    setState((s) => ({ ...s, [key]: 'connecting' }));
    setTimeout(() => {
      setState((s) => ({ ...s, [key]: 'connected' }));
      update({ deviceConnected: true });
    }, 1300);
  };

  return (
    <div className="space-y-2">
      {deviceItems.map(({ key, icon: Icon, label, detail }) =>
      <div key={key} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface2">
            <Icon size={20} className="text-ink" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">{label}</p>
            <p className="text-[12.5px] text-muted">{detail}</p>
          </div>
          {state[key] === 'connected' ?
        <span className="flex items-center gap-1 text-[13px] font-semibold text-good"><CheckIcon size={15} aria-hidden="true" /> Connected</span> :

        <Button size="sm" variant="secondary" onClick={() => connect(key)} disabled={state[key] === 'connecting'}>
              {state[key] === 'connecting' ? <Loader2Icon size={15} className="animate-spin" aria-label="Connecting" /> : 'Connect'}
            </Button>
        }
        </div>
      )}
      <p className="pt-3 text-[13px] leading-relaxed text-muted">
        No wearable? That’s fine — steps from your phone are used and marked as estimated. Wear OS support is planned.
      </p>
    </div>);

}