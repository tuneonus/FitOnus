import React from 'react';
import { DumbbellIcon, SparklesIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Badge } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { exerciseById, personalRecords } from '../data/workoutsMock';

export function ExerciseDetailScreen() {
  const { id } = useRouteParams();
  const { navigate } = useNavigation();
  const ex = exerciseById(id);
  const pr = personalRecords.find((r) => r.lift === ex.name);

  return (
    <Screen title={ex.name}>
      {ex.image ?
      <img src={ex.image} alt={`${ex.name} demonstration`} className="aspect-[4/3] w-full object-cover" /> :

      <div className="mx-4 flex aspect-[16/9] items-center justify-center rounded-3xl bg-surface2">
          <DumbbellIcon size={40} className="text-muted" aria-hidden="true" />
        </div>
      }
      <div className="px-5 pt-5">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">{ex.name}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="accent">{ex.muscle}</Badge>
          <Badge>{ex.equipment}</Badge>
          <Badge>{ex.level}</Badge>
          {ex.secondary.map((s) => <Badge key={s}>{s}</Badge>)}
        </div>

        {pr && pr.history.length > 0 &&
        <section className="mt-6 rounded-3xl border border-line bg-surface p-4" aria-label="Your progress">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[14px] font-semibold text-ink">Your top set</h2>
              <p className="text-[12px] text-muted">PR {pr.best} · {pr.date}</p>
            </div>
            <div className="mt-2">
              <LineChart points={pr.history.map((v, i) => ({ label: `W${34 + i}`, value: v }))} ariaLabel={`${ex.name} top set trend`} height={120} formatValue={(v) => `${v} kg`} strokeClassName="stroke-accentStrong" dotClassName="fill-accentStrong" />
            </div>
          </section>
        }

        <section className="mt-6" aria-labelledby="how-title">
          <h2 id="how-title" className="text-[17px] font-semibold text-ink">How to</h2>
          <ol className="mt-3 space-y-3">
            {ex.instructions.map((step, i) =>
            <li key={step} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface2 font-mono text-[12px] font-semibold text-ink">{i + 1}</span>
                <p className="pt-0.5 text-[15px] leading-relaxed text-ink">{step}</p>
              </li>
            )}
          </ol>
        </section>

        <section className="mt-6 rounded-2xl bg-surface2 p-4" aria-labelledby="cues-title">
          <h2 id="cues-title" className="text-[14px] font-semibold text-ink">Coaching cues</h2>
          <ul className="mt-2 space-y-1.5">
            {ex.cues.map((c) => <li key={c} className="text-[14px] text-muted">— {c}</li>)}
          </ul>
        </section>

        <Button variant="outline" fullWidth icon={SparklesIcon} className="mt-6" onClick={() => navigate('coach', { q: `How should I progress ${ex.name}?` })}>
          Ask coach about this exercise
        </Button>
        <p className="mt-3 text-center text-[12px] text-muted">AI form analysis from video is planned for a future release.</p>
      </div>
    </Screen>);

}