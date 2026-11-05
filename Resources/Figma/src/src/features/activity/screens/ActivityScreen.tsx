import React, { useState } from 'react';
import { ChevronRightIcon, DumbbellIcon, HeartPulseIcon, MoonIcon, ScaleIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { useHasDeviceData, useHealthStore } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../../workouts/store/workoutStore';
import { ActivityType, activityTypes, hourlySteps, todayActivity, weeklyActivity } from '../data/activityMock';

export function ActivityScreen() {
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const status = useHealthStore((s) => s.status);
  const plannedSession = useWorkoutStore((s) => s.plannedSession);
  const [view, setView] = useState<'today' | 'week'>('today');
  const a = todayActivity;

  const rings = [
  { label: 'Active calories', value: a.activeCalories, goal: 650, cls: 'stroke-move', size: 168 },
  { label: 'Active minutes', value: a.activeMinutes, goal: 45, cls: 'stroke-accentStrong', size: 134 },
  { label: 'Steps', value: a.steps, goal: a.stepGoal, cls: 'stroke-sky', size: 100 }];


  return (
    <Screen largeTitle="Activity" subtitle="Friday, October 9">
      <div className="space-y-6 px-4">
        {status === 'offline' && <StatusBanner tone="offline" title="Offline" body="Showing activity synced at 9:38 AM." />}
        <SegmentedControl label="Activity range" options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }]} value={view} onChange={setView} />

        {view === 'today' ?
        <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Activity rings">
            <div className="flex items-center gap-5">
              <div className="relative h-[168px] w-[168px] shrink-0" role="img" aria-label={rings.map((r) => `${r.label} ${r.value} of ${r.goal}`).join(', ')}>
                {rings.map((r, i) =>
              <ProgressRing key={r.label} size={r.size} stroke={14} value={r.value / r.goal} className={r.cls} wrapperClassName="absolute inset-0 m-auto" delay={i * 0.05} />
              )}
              </div>
              <dl className="space-y-3">
                {rings.map((r) =>
              <div key={r.label}>
                    <dt className="text-[12px] text-muted">{r.label}</dt>
                    <dd className="font-mono text-[17px] font-semibold text-ink">{r.value.toLocaleString()}<span className="text-[11px] font-normal text-muted"> /{r.goal.toLocaleString()}</span></dd>
                  </div>
              )}
              </dl>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
              {[['Distance', `${a.distanceKm} km`], ['Floors', `${a.floors}`], ['Active cal', `${a.activeCalories}`]].map(([l, v]) =>
            <div key={l}><dt className="text-[12px] text-muted">{l}</dt><dd className="font-mono text-[16px] font-semibold text-ink">{v}</dd></div>
            )}
            </dl>
            <div className="mt-3">
              <SourceTag source={hasDevice ? { kind: 'synced', label: 'iPhone + Apple Watch · 9:38 AM' } : { kind: 'estimated', label: 'iPhone motion only · calories estimated' }} />
            </div>
          </section> :

        <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Steps this week">
            <p className="text-[13px] text-muted">Steps this week</p>
            <p className="font-mono text-[28px] font-semibold text-ink">55,590</p>
            <div className="mt-3"><BarChart data={weeklyActivity} goal={10000} ariaLabel="Steps per day this week" barClassName="bg-sky" mutedBarClassName="bg-sky/30" height={120} /></div>
          </section>
        }

        {view === 'today' &&
        <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Steps by hour">
            <h2 className="text-[15px] font-semibold text-ink">Steps by hour</h2>
            <div className="mt-3"><BarChart data={hourlySteps} ariaLabel="Steps per hour today" barClassName="bg-sky" mutedBarClassName="bg-sky/30" height={90} highlightIndex={1} /></div>
          </section>
        }

        <section aria-labelledby="by-type">
          <h2 id="by-type" className="mb-2 px-1 text-[17px] font-semibold text-ink">By activity · this week</h2>
          <ListGroup>
            {(Object.keys(activityTypes) as ActivityType[]).map((k) => {
              const t = activityTypes[k];
              return <ListRow key={k} icon={t.icon} title={t.label} subtitle={t.detail} value={t.week} onClick={() => navigate('activityDetail', { type: k })} />;
            })}
          </ListGroup>
        </section>

        <button type="button" onClick={() => navigate('workouts')} className="flex w-full items-center gap-4 rounded-3xl border border-line bg-surface p-5 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accentInk"><DumbbellIcon size={20} aria-hidden="true" /></span>
          <span className="flex-1">
            <span className="block text-[16px] font-semibold text-ink">Workouts</span>
            <span className="block text-[13px] text-muted">Today: {plannedSession.title} · plans, library, records</span>
          </span>
          <ChevronRightIcon size={18} className="text-muted" aria-hidden="true" />
        </button>

        <ListGroup>
          <ListRow icon={HeartPulseIcon} iconClassName="text-accentStrong" title="Recovery" subtitle={hasDevice ? '84 · Train hard' : 'Needs a wearable'} onClick={() => navigate('recovery')} />
          <ListRow icon={MoonIcon} iconClassName="text-sleep" title="Sleep" subtitle={hasDevice ? '7h 45m · Score 88' : 'Needs a wearable'} onClick={() => navigate('sleep')} />
          <ListRow icon={ScaleIcon} title="Weight & body" subtitle="78.4 kg · −1.6 kg in 3 weeks" onClick={() => navigate('weight')} />
        </ListGroup>
      </div>
    </Screen>);

}