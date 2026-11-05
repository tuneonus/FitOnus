import React, { useState } from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Chip } from '../../../shared/components/ui/Chip';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { showToast } from '../../../shared/stores/toastStore';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { durationOptions, equipmentOptions, experienceLevels, fitnessGoals, workoutPlaces } from '../../onboarding/constants/options';

export function FitnessPreferencesScreen() {
  const { goBack } = useNavigation();
  const store = useProfileSetupStore();
  const [d, setD] = useState({ goal: store.goal, experience: store.experience, place: store.place, daysPerWeek: store.daysPerWeek, durationMin: store.durationMin, equipment: store.equipment });
  const toggleEq = (e: string) => setD({ ...d, equipment: d.equipment.includes(e) ? d.equipment.filter((x) => x !== e) : [...d.equipment, e] });

  const save = () => {
    store.update(d);
    showToast({ message: 'Preferences saved · next plan will reflect them' });
    goBack();
  };

  const Group = ({ title, children }: {title: string;children: React.ReactNode;}) =>
  <section className="px-4" aria-label={title}>
      <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>;


  return (
    <Screen title="Fitness preferences" footer={<Button size="lg" fullWidth onClick={save}>Save preferences</Button>}>
      <div className="space-y-6">
        <Group title="Main goal">
          {fitnessGoals.map((g) => <Chip key={g.value} selected={d.goal === g.value} onClick={() => setD({ ...d, goal: g.value })}>{g.label}</Chip>)}
        </Group>
        <Group title="Experience">
          {experienceLevels.map((e) => <Chip key={e.value} selected={d.experience === e.value} onClick={() => setD({ ...d, experience: e.value })}>{e.label}</Chip>)}
        </Group>
        <Group title="Where you train">
          {workoutPlaces.map((w) => <Chip key={w.value} icon={w.icon} selected={d.place === w.value} onClick={() => setD({ ...d, place: w.value })}>{w.label}</Chip>)}
        </Group>
        <section className="mx-4 rounded-3xl border border-line bg-surface p-4" aria-label="Days per week">
          <p className="mb-3 text-[13px] text-muted">Training days per week</p>
          <Stepper label="Days per week" value={d.daysPerWeek} onChange={(v) => setD({ ...d, daysPerWeek: v })} min={1} max={7} unit="days" />
        </section>
        <Group title="Session length">
          {durationOptions.map((m) => <Chip key={m} selected={d.durationMin === m} onClick={() => setD({ ...d, durationMin: m })}>{m} min</Chip>)}
        </Group>
        <Group title="Available equipment">
          {equipmentOptions.map((e) => <Chip key={e} selected={d.equipment.includes(e)} onClick={() => toggleEq(e)}>{e}</Chip>)}
        </Group>
      </div>
    </Screen>);

}