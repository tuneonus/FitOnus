import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, Loader2Icon, MicIcon, MicOffIcon, XIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { Chip } from '../../../shared/components/ui/Chip';
import { showToast } from '../../../shared/stores/toastStore';
import { VoiceWaveform } from '../../voice-coach/components/VoiceWaveform';
import { useVoiceStore } from '../../voice-coach/store/voiceStore';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels, mealOrder } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';

type Phase = 'idle' | 'listening' | 'processing' | 'review' | 'error';

const phrase = 'Two rotis, a bowl of dal and some paneer tikka';
const parsed: FoodItem[] = [
{ id: 'v1', name: 'Roti, whole wheat', serving: '2 pieces', kcal: 240, protein: 8, carbs: 40, fat: 6, fiber: 6, estimated: true, confidence: 0.92 },
{ id: 'v2', name: 'Dal tadka', serving: '1 bowl · 200 g', kcal: 230, protein: 12, carbs: 30, fat: 7, fiber: 8, estimated: true, confidence: 0.88 },
{ id: 'v3', name: 'Paneer tikka', serving: '“some” → 100 g', kcal: 220, protein: 16, carbs: 6, fat: 15, fiber: 1, estimated: true, confidence: 0.61 }];


export function VoiceMealEntryScreen() {
  const { goBack, replace } = useNavigation();
  const { meal: mealParam } = useRouteParams();
  const { micPermission, setMicPermission } = useVoiceStore();
  const addEntry = useNutritionStore((s) => s.addEntry);
  const removeEntry = useNutritionStore((s) => s.removeEntry);
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<FoodItem[]>(parsed);
  const [meal, setMeal] = useState<MealType>(mealParam as MealType ?? 'lunch');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const listen = () => {
    timers.current.forEach(clearTimeout);
    setTranscript('');
    setItems(parsed);
    setPhase('listening');
    const words = phrase.split(' ');
    words.forEach((_, i) => timers.current.push(setTimeout(() => setTranscript(words.slice(0, i + 1).join(' ')), 400 + i * 220)));
    const end = 400 + words.length * 220 + 400;
    timers.current.push(setTimeout(() => setPhase('processing'), end), setTimeout(() => setPhase('review'), end + 1200));
  };

  const stop = () => {
    if (transcript !== phrase) {
      timers.current.forEach(clearTimeout);
      setPhase('error');
    }
  };

  const total = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein }), { kcal: 0, protein: 0 });

  const save = () => {
    const id = addEntry({ meal, time: 'Now', method: 'voice', items });
    showToast({ message: `${mealLabels[meal]} logged · ${total.kcal} kcal`, actionLabel: 'Undo', onAction: () => removeEntry(id) });
    replace('nutrition');
  };

  return (
    <div className="flex h-full flex-col bg-hero px-5 pb-8 pt-12 text-heroInk">
      <div className="flex h-12 items-center justify-between">
        <p className="text-[14px] font-medium text-heroMuted">Log a meal by voice</p>
        <button type="button" onClick={goBack} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-heroInk/10"><XIcon size={20} aria-hidden="true" /></button>
      </div>

      {micPermission === 'denied' ?
      <div className="flex flex-1 flex-col items-center justify-center text-center">
          <MicOffIcon size={36} className="text-heroMuted" aria-hidden="true" />
          <p className="mt-4 text-[20px] font-semibold">Microphone is off</p>
          <p className="mt-2 text-[14px] text-heroMuted">Allow microphone access to log meals by voice, or search instead.</p>
          <Button className="mt-6" onClick={() => setMicPermission('granted')}>Allow microphone</Button>
        </div> :
      phase === 'review' ?
      <div className="no-scrollbar flex-1 overflow-y-auto">
          <p className="mt-2 text-[13px] text-heroMuted">You said</p>
          <p className="text-[18px] font-medium leading-snug">“{phrase}”</p>
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Meal">
            {mealOrder.map((m) => <Chip key={m} selected={m === meal} onClick={() => setMeal(m)} className={m === meal ? '' : 'border-heroInk/20 bg-transparent text-heroInk'}>{mealLabels[m]}</Chip>)}
          </div>
          <ul className="mt-4 divide-y divide-heroInk/10 rounded-3xl bg-heroInk/[0.06]">
            {items.map((i) =>
          <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{i.name}</span>
                  <span className="block text-[12px] text-heroMuted">{i.serving} · {i.protein} g protein</span>
                  {(i.confidence ?? 1) < 0.7 && <span className="mt-0.5 block text-[12px] text-accent">Portion unclear — check amount</span>}
                </span>
                <span className="font-mono text-[14px]">{i.kcal}</span>
                <button type="button" onClick={() => setItems(items.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.name}`} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-heroInk/10"><XIcon size={16} aria-hidden="true" /></button>
              </li>
          )}
          </ul>
          <p className="mt-3 flex justify-between px-1 font-mono text-[14px]"><span className="font-sans text-heroMuted">Estimated total</span>{total.kcal} kcal · {total.protein} g protein</p>
          <p className="mt-2 px-1 text-[12px] text-heroMuted">Voice entries are estimates. You can edit portions later from the meal diary.</p>
        </div> :

      <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="min-h-[56px] px-2 text-[22px] font-medium leading-snug">
            {phase === 'idle' && <span className="text-heroMuted">Say what you ate, e.g. “{phrase}”</span>}
            {phase === 'listening' && (transcript || <span className="text-heroMuted">Listening…</span>)}
            {phase === 'processing' && transcript}
            {phase === 'error' && <span>Didn’t catch that. Try again in a quieter spot.</span>}
          </p>
          <div className="mt-8 h-16"><VoiceWaveform active={phase === 'listening'} /></div>
          {phase === 'processing' && <p className="mt-4 flex items-center gap-2 text-[14px] text-heroMuted"><Loader2Icon size={16} className="animate-spin" aria-hidden="true" /> Matching foods and portions…</p>}
        </div>
      }

      {micPermission !== 'denied' &&
      <div className="shrink-0 pt-4">
          {phase === 'review' ?
        <div className="flex gap-2">
              <Button variant="inverse" size="lg" icon={MicIcon} onClick={listen} aria-label="Record again">Redo</Button>
              <Button size="lg" fullWidth icon={CheckIcon} disabled={items.length === 0} onClick={save}>Log {mealLabels[meal].toLowerCase()}</Button>
            </div> :

        <div className="flex justify-center">
              <button
            type="button"
            onClick={phase === 'listening' ? stop : listen}
            disabled={phase === 'processing'}
            aria-label={phase === 'listening' ? 'Stop listening' : 'Start listening'}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accentInk transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-50">
            
                {phase === 'listening' ? <span className="h-6 w-6 rounded-md bg-accentInk" /> : <MicIcon size={30} aria-hidden="true" />}
              </button>
            </div>
        }
        </div>
      }
    </div>);

}