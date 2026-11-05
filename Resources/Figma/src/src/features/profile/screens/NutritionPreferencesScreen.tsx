import React, { useState } from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Chip } from '../../../shared/components/ui/Chip';
import { showToast } from '../../../shared/stores/toastStore';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { allergyOptions, cuisineOptions, dietOptions } from '../../onboarding/constants/options';
import { nutritionGoals } from '../../nutrition/constants/meals';

export function NutritionPreferencesScreen() {
  const { goBack } = useNavigation();
  const store = useProfileSetupStore();
  const [d, setD] = useState({ diet: store.diet, allergies: store.allergies, cuisines: store.cuisines });
  const toggle = (k: 'allergies' | 'cuisines', v: string) => setD({ ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] });

  const save = () => {
    store.update(d);
    showToast({ message: 'Saved · meal suggestions updated' });
    goBack();
  };

  return (
    <Screen title="Nutrition preferences" footer={<Button size="lg" fullWidth onClick={save}>Save preferences</Button>}>
      <div className="space-y-6">
        <section className="px-4" aria-label="Diet">
          <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">Diet</h2>
          <div className="flex flex-wrap gap-2">
            {dietOptions.map((o) => <Chip key={o.value} selected={d.diet === o.value} onClick={() => setD({ ...d, diet: o.value })}>{o.label}</Chip>)}
          </div>
        </section>
        <section className="px-4" aria-label="Allergies">
          <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">Allergies & intolerances</h2>
          <div className="flex flex-wrap gap-2">
            {allergyOptions.map((a) => <Chip key={a} selected={d.allergies.includes(a)} onClick={() => toggle('allergies', a)}>{a}</Chip>)}
          </div>
          <p className="mt-2 px-1 text-[12px] text-muted">Your coach will never suggest foods containing these.</p>
        </section>
        <section className="px-4" aria-label="Cuisines">
          <h2 className="mb-2 px-1 text-[13px] font-medium text-muted">Favourite cuisines</h2>
          <div className="flex flex-wrap gap-2">
            {cuisineOptions.map((c) => <Chip key={c} selected={d.cuisines.includes(c)} onClick={() => toggle('cuisines', c)}>{c}</Chip>)}
          </div>
        </section>
        <section className="mx-4 rounded-3xl border border-line bg-surface p-4" aria-label="Daily targets">
          <p className="text-[15px] font-semibold text-ink">Daily targets</p>
          <dl className="mt-3 grid grid-cols-3 gap-y-3">
            {[['Calories', `${nutritionGoals.kcal.toLocaleString()}`], ['Protein', `${nutritionGoals.protein} g`], ['Carbs', `${nutritionGoals.carbs} g`], ['Fat', `${nutritionGoals.fat} g`], ['Fiber', `${nutritionGoals.fiber} g`]].map(([l, v]) =>
            <div key={l}><dt className="text-[12px] text-muted">{l}</dt><dd className="font-mono text-[15px] font-semibold text-ink">{v}</dd></div>
            )}
          </dl>
          <p className="mt-3 text-[12px] text-muted">Calculated from your goal, weight and activity. Ask your coach to adjust them.</p>
        </section>
      </div>
    </Screen>);

}