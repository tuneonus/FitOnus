import React, { useState } from 'react';
import { CameraIcon, MicIcon, PencilLineIcon, ScanBarcodeIcon, SearchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { showToast } from '../../../shared/stores/toastStore';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels, mealOrder } from '../constants/meals';
import type { MealType } from '../types/nutrition';

type AddFoodSheetProps = {open: boolean;meal: MealType;onClose: () => void;};

export function AddFoodSheet({ open, meal: initialMeal, onClose }: AddFoodSheetProps) {
  const { navigate } = useNavigation();
  const { addEntry, removeEntry } = useNutritionStore();
  const [mode, setMode] = useState<'pick' | 'manual'>('pick');
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [form, setForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [submitted, setSubmitted] = useState(false);

  const close = () => {
    setMode('pick');
    setSubmitted(false);
    onClose();
  };
  const go = (fn: () => void) => {
    close();
    fn();
  };

  const methods = [
  { icon: SearchIcon, label: 'Search food', detail: 'Database of 1M+ foods', onClick: () => go(() => navigate('foodSearch', { meal: initialMeal })) },
  { icon: CameraIcon, label: 'Snap a photo', detail: 'AI estimates portions', onClick: () => go(() => navigate('mealPhoto', { meal: initialMeal })) },
  { icon: ScanBarcodeIcon, label: 'Scan barcode', detail: 'Packaged foods', onClick: () => go(() => navigate('barcodeScanner', { meal: initialMeal })) },
  { icon: MicIcon, label: 'Say it', detail: '“Two rotis and dal”', onClick: () => go(() => navigate('voiceMealEntry', { meal: initialMeal })) },
  { icon: PencilLineIcon, label: 'Quick add', detail: 'Enter calories and macros', onClick: () => setMode('manual') }];


  const nameError = submitted && !form.name.trim() ? 'Name the food.' : undefined;
  const kcalError = submitted && !(Number(form.kcal) > 0) ? 'Enter calories.' : undefined;

  const saveManual = () => {
    setSubmitted(true);
    if (!form.name.trim() || !(Number(form.kcal) > 0)) return;
    const id = addEntry({
      meal,
      time: 'Just now',
      method: 'manual',
      items: [{ id: `q-${Date.now()}`, name: form.name, serving: '1 serving', kcal: Number(form.kcal), protein: Number(form.protein) || 0, carbs: Number(form.carbs) || 0, fat: Number(form.fat) || 0, fiber: 0 }]
    });
    showToast({ message: `Added to ${mealLabels[meal]}`, actionLabel: 'Undo', onAction: () => removeEntry(id) });
    setForm({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
    close();
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={mode === 'pick' ? `Add to ${mealLabels[initialMeal]}` : 'Quick add'}
      footer={mode === 'manual' ? <Button size="lg" fullWidth onClick={saveManual}>Add food</Button> : undefined}>
      
      {mode === 'pick' ?
      <ul className="grid grid-cols-2 gap-2">
          {methods.map(({ icon: Icon, label, detail, onClick }, i) =>
        <li key={label} className={i === methods.length - 1 ? 'col-span-2' : ''}>
              <button type="button" onClick={onClick} className="flex h-full w-full flex-col items-start rounded-2xl bg-surface2 p-4 text-left transition-colors duration-150 hover:bg-ink/[0.09]">
                <Icon size={22} className="text-ink" aria-hidden="true" />
                <span className="mt-3 text-[15px] font-semibold text-ink">{label}</span>
                <span className="text-[12.5px] text-muted">{detail}</span>
              </button>
            </li>
        )}
        </ul> :

      <div className="space-y-4">
          <SegmentedControl label="Meal" options={mealOrder.map((m) => ({ value: m, label: mealLabels[m] }))} value={meal} onChange={setMeal} />
          <TextField label="Food name" placeholder="e.g. Homemade poha" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={nameError} />
          <TextField label="Calories" inputMode="numeric" suffix="kcal" value={form.kcal} onChange={(e) => setForm({ ...form, kcal: e.target.value.replace(/[^\d]/g, '') })} error={kcalError} />
          <div className="grid grid-cols-3 gap-2">
            {(['protein', 'carbs', 'fat'] as const).map((k) =>
          <TextField key={k} label={k[0].toUpperCase() + k.slice(1)} inputMode="decimal" suffix="g" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(/[^\d.]/g, '') })} />
          )}
          </div>
          <p className="text-[12.5px] text-muted">Manual entries are marked as logged by you.</p>
        </div>
      }
    </BottomSheet>);

}