import React from 'react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { ActivityType, activityTypes } from '../data/activityMock';

export function ActivityDetailScreen() {
  const { type = 'steps' } = useRouteParams();
  const { navigate } = useNavigation();
  const t = activityTypes[type as ActivityType] ?? activityTypes.steps;

  return (
    <Screen title={t.label}>
      <div className="px-5">
        <p className="text-[13px] text-muted">This week</p>
        <p className="font-mono text-[36px] font-semibold tracking-[-0.03em] text-ink">{t.week}</p>
        <p className="text-[13px] text-muted">{t.detail}</p>
      </div>
      {t.series.length === 0 ?
      <EmptyState
        icon={t.icon}
        title={`No ${t.label.toLowerCase()} yet`}
        body="Start a pool or open-water swim on Apple Watch and it will sync here with distance, laps and heart rate."
        actionLabel="Check device connection"
        onAction={() => navigate('appleWatch')} /> :


      <>
          <section className="mx-4 mt-5 rounded-3xl border border-line bg-surface p-5" aria-label={`${t.label} per day`}>
            <BarChart data={t.series} ariaLabel={`${t.label} per day`} formatValue={(v) => `${v.toLocaleString()} ${t.unit}`} barClassName="bg-sky" mutedBarClassName="bg-sky/30" height={120} goal={type === 'steps' ? 10000 : undefined} />
          </section>
          {t.sessions.length > 0 &&
        <section className="mt-6 px-4" aria-labelledby="sessions">
              <h2 id="sessions" className="mb-2 px-1 text-[17px] font-semibold text-ink">Sessions</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
                {t.sessions.map((s) =>
            <li key={s.date} className="px-4 py-3.5">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[15px] font-semibold text-ink">{s.title}</p>
                      <p className="text-[12px] text-muted">{s.date}</p>
                    </div>
                    <p className="mt-0.5 font-mono text-[12.5px] text-muted">{s.stats}</p>
                    <div className="mt-1"><SourceTag source={{ kind: 'synced', label: 'Apple Watch workout' }} /></div>
                  </li>
            )}
              </ul>
            </section>
        }
        </>
      }
    </Screen>);

}