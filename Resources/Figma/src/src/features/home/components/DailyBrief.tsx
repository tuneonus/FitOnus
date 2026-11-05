import React from 'react';
import { ChevronRightIcon, MicIcon, ShieldCheckIcon, SparklesIcon, WatchIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { briefDrivers, dailyBrief, suggestedQuestions } from '../data/homeMock';

export function DailyBrief() {
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const hasData = status === 'synced' || status === 'offline' || status === 'error';
  const needsPermission = status === 'permissions';

  const askCoach = (q?: string) => navigate('coach', q ? { q } : undefined);

  return (
    <section aria-labelledby="brief-title" className="px-4">
      <div className="rounded-[28px] bg-hero p-5 text-heroInk">
        <div className="flex items-center justify-between">
          <h2 id="brief-title" className="flex items-center gap-1.5 text-[13px] font-medium text-heroMuted">
            <SparklesIcon size={14} className="text-accent" aria-hidden="true" />
            Daily brief
          </h2>
          {hasData && <span className="text-[12px] text-heroMuted">Updated {dailyBrief.updatedAt}</span>}
        </div>

        <button
          type="button"
          onClick={() => hasData ? navigate('recovery') : navigate('healthIntegration')}
          className="mt-4 flex w-full items-center gap-5 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          
          <ProgressRing
            size={108}
            stroke={9}
            value={hasData ? dailyBrief.recovery / 100 : 0}
            className="stroke-accent"
            trackClassName="stroke-heroInk/10"
            label={hasData ? `Recovery ${dailyBrief.recovery} out of 100` : 'Recovery unavailable'}>
            
            <span className="font-mono text-[32px] font-semibold leading-none tracking-[-0.03em]">
              {hasData ? dailyBrief.recovery : '—'}
            </span>
            <span className="mt-1 text-[11px] text-heroMuted">Recovery</span>
          </ProgressRing>
          <span className="min-w-0 flex-1">
            <span className="block text-[21px] font-semibold leading-tight tracking-[-0.02em]">
              {hasData ? dailyBrief.headline : needsPermission ? 'Sleep & HRV access is off' : 'Recovery needs more data'}
            </span>
            {hasData ?
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-medium text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                {dailyBrief.recommendation}
                <ChevronRightIcon size={12} aria-hidden="true" />
              </span> :

            <span className="mt-1.5 block text-[13px] leading-snug text-heroMuted">
                {needsPermission ?
              'Recovery uses sleep and HRV. Both are switched off in Apple Health.' :
              'Sleep, HRV and resting heart rate aren’t connected yet.'}
              </span>
            }
          </span>
        </button>

        {hasData ?
        <>
            <p className="mt-4 text-[14px] leading-relaxed text-heroInk/85">{dailyBrief.summary}</p>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-heroInk/10 border-t border-heroInk/10 pt-4">
              {briefDrivers.map((driver) =>
            <div key={driver.label} className="px-3 first:pl-0 last:pr-0">
                  <dt className="text-[12px] text-heroMuted">{driver.label}</dt>
                  <dd className="mt-1">
                    <span className="font-mono text-[17px] font-semibold tracking-[-0.02em]">{driver.value}</span>
                    {driver.unit && <span className="ml-0.5 text-[11px] text-heroMuted">{driver.unit}</span>}
                    <span className={`mt-0.5 block text-[11.5px] ${driver.positive ? 'text-accent' : 'text-heroMuted'}`}>
                      {driver.delta}
                    </span>
                  </dd>
                </div>
            )}
            </dl>
          </> :

        <div className="mt-4">
            <p className="text-[14px] leading-relaxed text-heroInk/85">
              I can still coach your training and meals. {needsPermission ? 'Turn access back on' : 'Connect Apple Health or a wearable'} and I’ll tell you when to push and when to rest.
            </p>
            <button
            type="button"
            onClick={() => navigate('healthIntegration')}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-semibold text-accentInk transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heroInk/60">
            
              {needsPermission ? <ShieldCheckIcon size={18} aria-hidden="true" /> : <WatchIcon size={18} aria-hidden="true" />}
              {needsPermission ? 'Review permissions' : 'Connect Apple Health'}
            </button>
          </div>
        }

        <div className="mt-5">
          <ul aria-label="Suggested questions" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {suggestedQuestions.map((question) =>
            <li key={question} className="shrink-0">
                <button
                type="button"
                onClick={() => askCoach(question)}
                className="h-9 whitespace-nowrap rounded-full border border-heroInk/15 px-3.5 text-[13px] text-heroInk transition-colors duration-150 hover:bg-heroInk/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                
                  {question}
                </button>
              </li>
            )}
          </ul>
          <div className="mt-3 flex h-[52px] items-center gap-2 rounded-2xl bg-heroInk/[0.08] pl-4 pr-1.5">
            <button
              type="button"
              onClick={() => askCoach()}
              className="h-full flex-1 text-left text-[14px] text-heroMuted focus-visible:outline-none">
              
              Ask your coach anything…
            </button>
            <button
              type="button"
              aria-label="Talk to voice coach"
              onClick={() => navigate('voiceCoach')}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accentInk transition-transform duration-150 ease-out active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heroInk/60">
              
              <MicIcon size={18} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-heroMuted">
            Coaching guidance from your data — not a medical diagnosis.
          </p>
        </div>
      </div>
    </section>);

}