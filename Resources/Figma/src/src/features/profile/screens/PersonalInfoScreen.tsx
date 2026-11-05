import React, { useState } from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { showToast } from '../../../shared/stores/toastStore';
import { ProfileSetup, useProfileSetupStore } from '../../onboarding/store/profileSetupStore';

export function PersonalInfoScreen() {
  const { goBack } = useNavigation();
  const store = useProfileSetupStore();
  const [draft, setDraft] = useState({ name: store.name, sex: store.sex, dob: `${store.dobYear}-${String(store.dobMonth).padStart(2, '0')}-${String(store.dobDay).padStart(2, '0')}`, heightCm: store.heightCm, weightKg: store.weightKg });
  const [error, setError] = useState<string | undefined>();

  const save = () => {
    if (!draft.name.trim()) return setError('Enter your name.');
    const [y, m, d] = draft.dob.split('-').map(Number);
    store.update({ name: draft.name.trim(), sex: draft.sex, dobYear: y, dobMonth: m, dobDay: d, heightCm: draft.heightCm, weightKg: draft.weightKg });
    showToast({ message: 'Personal information saved' });
    goBack();
  };

  return (
    <Screen title="Personal information" footer={<Button size="lg" fullWidth onClick={save}>Save</Button>}>
      <div className="space-y-5 px-4">
        <TextField label="Full name" value={draft.name} onChange={(e) => {setDraft({ ...draft, name: e.target.value });setError(undefined);}} error={error} autoComplete="name" />
        <TextField label="Date of birth" type="date" value={draft.dob} onChange={(e) => setDraft({ ...draft, dob: e.target.value })} />
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Sex (used for calorie estimates)</p>
          <SegmentedControl<ProfileSetup['sex']> label="Sex" options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'unspecified', label: 'Prefer not' }]} value={draft.sex} onChange={(sex) => setDraft({ ...draft, sex })} />
        </div>
        <div className="rounded-3xl border border-line bg-surface p-4">
          <p className="mb-3 text-[13px] text-muted">Height</p>
          <Stepper label="Height" value={draft.heightCm} onChange={(v) => setDraft({ ...draft, heightCm: v })} min={120} max={230} unit="cm" />
        </div>
        <div className="rounded-3xl border border-line bg-surface p-4">
          <p className="mb-3 text-[13px] text-muted">Starting weight</p>
          <Stepper label="Weight" value={draft.weightKg} onChange={(v) => setDraft({ ...draft, weightKg: v })} step={0.1} decimals={1} min={30} max={250} unit="kg" />
          <p className="mt-2 text-[12px] text-muted">Daily weigh-ins are logged from the Weight screen.</p>
        </div>
      </div>
    </Screen>);

}