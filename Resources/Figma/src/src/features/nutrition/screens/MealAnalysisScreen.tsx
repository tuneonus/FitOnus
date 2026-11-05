import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { InfoIcon, PlusIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Badge } from '../../../shared/components/ui/Badge';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { images } from '../../../shared/constants/images';
import { showToast } from '../../../shared/stores/toastStore';
import { ThinkingIndicator } from '../../ai-coach/components/ThinkingIndicator';
import { mockAiTools } from '../../ai-coach/services/mockAiTools';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { scaleFood, sumNutrients, useNutritionStore } from '../store/nutritionStore';
import { foodDatabase } from '../data/foodsMock';
import { mealLabels, mealOrder } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';

type Row = {base: FoodItem;factor: number;};

export function MealAnalysisScreen() {
  const { popTo } = useNavigation();
  const { meal: mealParam = 'lunch' } = useRouteParams();
  const offline = useHealthStore((s) => s.status === 'offline');
  const { addEntry, removeEntry } = useNutritionStore();
  const [phase, setPhase] = useState<'analyzing' | 'review' | 'error'>('analyzing');
  const [rows, setRows] = useState<Row[]>([]);
  const [meal, setMeal] = useState<MealType>(mealParam as MealType);
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    setPhase('analyzing');
    if (offline) {
      setTimeout(() => setPhase('error'), 1500);
      return;
    }
    const res = await mockAiTools.analyzeMealImage({ imageUri: images.mealPhoto });
    setRows(res.items.map((base) => ({ base, factor: 1 })));
    setPhase('review');
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = rows.map((r) => scaleFood(r.base, r.factor));
  const totals = sumNutrients(items);

  const save = () => {
    const id = addEntry({ meal, time: 'Just now', method: 'photo', items: items.map((i, idx) => ({ ...i, id: `ph-${Date.now()}-${idx}` })) });
    setConfirming(false);
    showToast({ message: `Meal saved to ${mealLabels[meal]}`, actionLabel: 'Undo', onAction: () => removeEntry(id) });
    popTo('nutrition');
  };

  return (
    <Screen title="Meal analysis" footer={phase === 'review' ? <Button size="lg" fullWidth disabled={!rows.length} onClick={() => setConfirming(true)}>Review & save · {Math.round(totals.kcal)} kcal</Button> : undefined}>
      <div className="px-4">
        <div className="relative overflow-hidden rounded-3xl">
          <img src={images.mealPhoto} alt="Your meal photo" className="aspect-[4/3] w-full object-cover" />
          {phase === 'analyzing' &&
          <motion.span className="absolute inset-x-0 h-1 bg-accent" animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} aria-hidden="true" />
          }
        </div>

        {phase === 'analyzing' &&
        <div className="mt-5">
            <p className="text-[17px] font-semibold text-ink">Identifying foods…</p>
            <div className="mt-3"><ThinkingIndicator toolCalls={['analyzeMealImage', 'searchFood', 'getNutritionLogs']} /></div>
          </div>
        }

        {phase === 'error' &&
        <div className="mt-5 space-y-3">
            <StatusBanner tone="error" title="Couldn’t analyze this photo" body="The analysis service didn’t respond. Your photo wasn’t uploaded." actionLabel="Retry" onAction={run} />
            <Button variant="outline" fullWidth onClick={() => popTo('nutrition')}>Log manually instead</Button>
          </div>
        }

        {phase === 'review' &&
        <>
            <div className="mt-5 flex items-start gap-2 rounded-2xl bg-surface2 p-3.5 text-[13px] leading-snug text-muted">
              <InfoIcon size={15} className="mt-0.5 shrink-0 text-ink" aria-hidden="true" />
              All values are AI estimates from the photo. Adjust portions or remove anything that’s wrong before saving.
            </div>
            <ul className="mt-4 space-y-2">
              {rows.map((r, i) => {
              const scaled = items[i];
              const low = (r.base.confidence ?? 1) < 0.7;
              return (
                <li key={r.base.id} className={`rounded-2xl border bg-surface p-4 ${low ? 'border-warn' : 'border-line'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-ink">{r.base.name}</p>
                        <p className="text-[12.5px] text-muted">{scaled.serving}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge tone={low ? 'warn' : 'neutral'}>{Math.round((r.base.confidence ?? 1) * 100)}% sure</Badge>
                        <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.base.name}`} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface2"><XIcon size={16} aria-hidden="true" /></button>
                      </div>
                    </div>
                    {low && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-warn"><TriangleAlertIcon size={13} aria-hidden="true" /> Low confidence — please check this item.</p>}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1" role="group" aria-label={`${r.base.name} portion`}>
                        {[0.5, 1, 1.5, 2].map((f) =>
                      <button key={f} type="button" aria-pressed={r.factor === f} onClick={() => setRows(rows.map((x, j) => j === i ? { ...x, factor: f } : x))} className={`h-8 rounded-full px-2.5 font-mono text-[12px] ${r.factor === f ? 'bg-ink text-bg' : 'bg-surface2 text-ink'}`}>
                            {f}×
                          </button>
                      )}
                      </div>
                      <p className="text-right font-mono text-[13px] text-ink">{scaled.kcal} kcal · {scaled.protein}g P</p>
                    </div>
                  </li>);

            })}
            </ul>
            <Button variant="outline" fullWidth icon={PlusIcon} className="mt-3" onClick={() => setRows([...rows, { base: { ...foodDatabase[10], estimated: true, confidence: 1, id: `add-${Date.now()}` }, factor: 1 }])}>
              Add missing item (roti)
            </Button>
            <dl className="mt-5 grid grid-cols-5 gap-1 rounded-2xl bg-hero p-4 text-center text-heroInk">
              {[['kcal', Math.round(totals.kcal)], ['Protein', `${Math.round(totals.protein)}g`], ['Carbs', `${Math.round(totals.carbs)}g`], ['Fat', `${Math.round(totals.fat)}g`], ['Fiber', `${Math.round(totals.fiber)}g`]].map(([l, v]) =>
            <div key={l}><dt className="text-[10.5px] text-heroMuted">{l}</dt><dd className="font-mono text-[15px] font-semibold">{v}</dd></div>
            )}
            </dl>
            <p className="mt-2 text-center text-[11.5px] text-muted">Estimated · ±15–25% typical for photo analysis</p>
          </>
        }
      </div>

      <BottomSheet open={confirming} onClose={() => setConfirming(false)} title="Save this meal?" description={`${rows.length} items · ${Math.round(totals.kcal)} kcal (estimated)`} footer={<Button size="lg" fullWidth onClick={save}>Save to {mealLabels[meal]}</Button>}>
        <SegmentedControl label="Meal" options={mealOrder.map((m) => ({ value: m, label: mealLabels[m] }))} value={meal} onChange={setMeal} />
        <ul className="mt-4 divide-y divide-line">
          {items.map((i) =>
          <li key={i.id} className="flex justify-between py-2.5 text-[14px]"><span className="text-ink">{i.name}</span><span className="font-mono text-muted">{i.kcal}</span></li>
          )}
        </ul>
        <p className="mt-3 text-[12.5px] text-muted">Saved items stay marked “Est.” so you and your coach know they weren’t weighed.</p>
      </BottomSheet>
    </Screen>);

}