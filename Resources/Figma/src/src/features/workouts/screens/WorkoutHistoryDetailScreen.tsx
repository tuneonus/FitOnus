import React from 'react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { Button } from '../../../shared/components/ui/Button';
import { useWorkoutStore } from '../store/workoutStore';

export function WorkoutHistoryDetailScreen() {
  const { id } = useRouteParams();
  const { navigate } = useNavigation();
  const log = useWorkoutStore((s) => s.history.find((h) => h.id === id) ?? s.history[0]);
  if (!log) return null;
  const synced = log.source === 'Apple Watch';

  return (
    <Screen title={log.date}>
      <div className="px-5">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">{log.title}</h1>
        <div className="mt-1.5">
          <SourceTag source={synced ? { kind: 'synced', label: 'Recorded on Apple Watch · synced' } : { kind: 'manual', label: 'Logged in FitOnus' }} />
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-line py-4">
          {[
          ['Duration', `${log.durationMin} min`],
          ['Volume', log.volumeKg ? `${(log.volumeKg / 1000).toFixed(1)} t` : '—'],
          ['Avg HR', log.avgHr ? `${log.avgHr}` : '—'],
          ['Sets', log.sets ? `${log.sets}` : '—'],
          ['Calories', `${log.calories}`],
          ['PRs', `${log.prs}`]].
          map(([l, v]) =>
          <div key={l}>
              <dt className="text-[12px] text-muted">{l}</dt>
              <dd className="font-mono text-[18px] font-semibold text-ink">{v}</dd>
            </div>
          )}
        </dl>
        {!synced && <p className="mt-2 text-[12px] text-muted">Calories are estimated when no heart-rate data is attached.</p>}
        <h2 className="mt-6 text-[17px] font-semibold text-ink">Exercises</h2>
        <ul className="mt-2 divide-y divide-line">
          {log.exercises.map((e) =>
          <li key={e.name} className="flex justify-between gap-3 py-3">
              <span className="text-[15px] text-ink">{e.name}</span>
              <span className="shrink-0 font-mono text-[13px] text-muted">{e.best}</span>
            </li>
          )}
        </ul>
        <Button variant="outline" fullWidth className="mt-6" onClick={() => navigate('coach', { q: 'Compare this month with last month' })}>
          Ask coach to review
        </Button>
      </div>
    </Screen>);

}