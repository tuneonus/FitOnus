import React from 'react';
import { ActivityIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { cn } from '../../../shared/utils/cn';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { recommendationLevels, recoveryInputs, recoveryTrend } from '../data/recoveryMock';

export function RecoveryScreen() {
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const hasData = status === 'synced' || status === 'offline' || status === 'error';
  const score = 84;
  const active = score >= 70 ? 'hard' : score >= 40 ? 'moderate' : 'rest';

  if (!hasData) {
    return (
      <Screen title="Recovery">
        <EmptyState
          icon={ActivityIcon}
          title={status === 'permissions' ? 'Recovery needs HRV and sleep access' : 'Recovery needs a wearable'}
          body="The score combines overnight HRV, resting heart rate and sleep. Without them we show no score rather than a guess."
          actionLabel={status === 'permissions' ? 'Review permissions' : 'Connect a device'}
          onAction={() => navigate('healthIntegration')} />
        
      </Screen>);

  }

  return (
    <Screen title="Recovery">
      <section className="mx-4 rounded-[28px] bg-hero p-6 text-heroInk" aria-label="Recovery score">
        <div className="flex items-center gap-5">
          <ProgressRing size={128} stroke={11} value={score / 100} className="stroke-accent" trackClassName="stroke-heroInk/10" label={`Recovery ${score} of 100`}>
            <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.04em]">{score}</span>
            <span className="mt-1 text-[11px] text-heroMuted">of 100</span>
          </ProgressRing>
          <div>
            <p className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">Primed to train</p>
            <p className="mt-1 text-[13px] text-heroMuted">Up 10 from yesterday</p>
            <div className="mt-2"><SourceTag tone="hero" source={{ kind: 'estimated', label: 'FitOnus model · not clinical' }} /></div>
          </div>
        </div>
      </section>

      <section className="mt-6 px-4" aria-labelledby="rec-levels">
        <h2 id="rec-levels" className="mb-2 px-1 text-[17px] font-semibold text-ink">Today’s recommendation</h2>
        <ul className="space-y-2">
          {recommendationLevels.map((l) =>
          <li key={l.key} className={cn('rounded-2xl border p-4', l.key === active ? 'border-ink bg-surface' : 'border-line bg-surface opacity-60')} aria-current={l.key === active ? 'true' : undefined}>
              <div className="flex items-baseline justify-between">
                <p className="text-[15px] font-semibold text-ink">{l.label}</p>
                <p className="font-mono text-[12px] text-muted">{l.range}</p>
              </div>
              <p className="mt-0.5 text-[13px] text-muted">{l.detail}</p>
            </li>
          )}
        </ul>
      </section>

      <section className="mt-6 px-4" aria-labelledby="rec-inputs">
        <h2 id="rec-inputs" className="mb-2 px-1 text-[17px] font-semibold text-ink">What’s driving it</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {recoveryInputs.map((i) =>
          <li key={i.key} className="px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14.5px] font-medium text-ink">{i.label}</p>
                <p className="font-mono text-[14px] font-semibold text-ink">{i.value}</p>
              </div>
              <div className="mt-2 flex items-center gap-2" aria-label={`Impact ${i.impact > 0 ? 'positive' : i.impact < 0 ? 'negative' : 'neutral'}`}>
                <div className="relative h-1.5 flex-1 rounded-full bg-ink/[0.07]">
                  <span className="absolute left-1/2 top-0 h-1.5 w-px bg-ink/30" />
                  <span
                  className={cn('absolute top-0 h-1.5 rounded-full', i.impact >= 0 ? 'bg-good' : 'bg-warn')}
                  style={i.impact >= 0 ? { left: '50%', width: `${i.impact * 50}%` } : { right: '50%', width: `${-i.impact * 50}%` }} />
                
                </div>
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted">{i.note} · {i.baseline}</p>
              <div className="mt-1"><SourceTag source={i.source} /></div>
            </li>
          )}
        </ul>
      </section>

      <section className="mx-4 mt-6 rounded-3xl border border-line bg-surface p-4" aria-label="Recovery trend">
        <h2 className="text-[15px] font-semibold text-ink">14-day trend</h2>
        <div className="mt-2"><LineChart points={recoveryTrend} ariaLabel="Recovery score over 14 days" target={70} targetLabel="Train-hard line" height={150} strokeClassName="stroke-accentStrong" dotClassName="fill-accentStrong" /></div>
      </section>

      <button type="button" onClick={() => navigate('coach', { q: 'Why is my recovery lower this week?' })} className="mx-4 mt-4 flex w-[calc(100%-2rem)] gap-3 rounded-3xl bg-surface2 p-5 text-left">
        <SparklesIcon size={18} className="mt-0.5 shrink-0 text-accentStrong" aria-hidden="true" />
        <span>
          <span className="block text-[15px] font-semibold text-ink">Wednesday’s dip explained</span>
          <span className="mt-1 block text-[13.5px] leading-snug text-muted">Late bedtime + heavy legs dropped you to 58. You bounced back in two nights — a sign your base fitness is improving.</span>
        </span>
      </button>
      <p className="mx-6 mt-4 text-[11.5px] leading-snug text-muted">Recovery is a training guide built from your wearable data. It is not a medical measurement.</p>
    </Screen>);

}