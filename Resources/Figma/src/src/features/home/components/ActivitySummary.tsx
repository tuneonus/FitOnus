import React from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { activityMeta, activityRings, weeklySteps } from '../data/homeMock';

const ringSizes = [124, 98, 72];

export function ActivitySummary() {
  const { switchTab } = useNavigation();
  const hasDevice = useHasDeviceData();
  const maxSteps = Math.max(...weeklySteps.map((d) => d.steps), activityMeta.stepGoal);
  const avgPercent = activityMeta.weeklyAverage / maxSteps * 100;
  const ringLabel = activityRings.
  map((r) => `${r.label} ${r.value.toLocaleString()} of ${r.goal.toLocaleString()}`).
  join(', ');

  return (
    <section aria-labelledby="activity-title" className="px-4">
      <SectionHeader id="activity-title" title="Activity" action="Details" onAction={() => switchTab('activity')} />
      <div className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex items-center gap-5">
          <div className="relative h-[124px] w-[124px] shrink-0" role="img" aria-label={ringLabel}>
            {activityRings.map((ring, index) =>
            <ProgressRing
              key={ring.key}
              size={ringSizes[index]}
              stroke={11}
              value={ring.value / ring.goal}
              className={ring.strokeClass}
              wrapperClassName="absolute inset-0 m-auto"
              delay={index * 0.05} />

            )}
          </div>
          <ul className="flex-1 space-y-3">
            {activityRings.map((ring) =>
            <li key={ring.key} className="flex items-start gap-2.5">
                <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${ring.dotClass}`} aria-hidden="true" />
                <div>
                  <p className="text-[12px] text-muted">{ring.label}</p>
                  <p className="text-ink">
                    <span className="font-mono text-[16px] font-semibold tracking-[-0.02em]">{ring.value.toLocaleString()}</span>
                    <span className="text-[12px] text-muted"> / {ring.goal.toLocaleString()} {ring.unit}</span>
                  </p>
                </div>
              </li>
            )}
          </ul>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[13px] font-medium text-ink">Steps this week</h3>
            <p className="text-[12px] text-muted">
              Avg <span className="font-mono">{activityMeta.weeklyAverage.toLocaleString()}</span>
            </p>
          </div>
          <div className="relative mt-3 flex h-16 items-end gap-2" role="img" aria-label="Daily steps for the last 7 days">
            <span className="absolute inset-x-0 border-t border-dashed border-ink/25" style={{ bottom: `${avgPercent}%` }} aria-hidden="true" />
            {weeklySteps.map((d, index) => {
              const isToday = index === weeklySteps.length - 1;
              const hitGoal = d.steps >= activityMeta.stepGoal;
              return (
                <div
                  key={index}
                  className={`flex-1 rounded-md ${isToday ? 'bg-sky' : hitGoal ? 'bg-sky/45' : 'bg-ink/10'}`}
                  style={{ height: `${Math.max(6, d.steps / maxSteps * 100)}%` }} />);


            })}
          </div>
          <div className="mt-1.5 flex gap-2" aria-hidden="true">
            {weeklySteps.map((d, index) =>
            <span key={index} className={`flex-1 text-center text-[11px] ${index === weeklySteps.length - 1 ? 'font-semibold text-ink' : 'text-muted'}`}>
                {d.day}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[12px] text-muted">{activityMeta.pace}</p>
            <SourceTag source={hasDevice ? { kind: 'synced', label: 'Watch · 9:38' } : { kind: 'estimated', label: 'iPhone' }} />
          </div>
        </div>
      </div>
    </section>);

}