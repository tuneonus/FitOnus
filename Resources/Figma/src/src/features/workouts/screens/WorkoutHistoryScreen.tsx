import React from 'react';
import { DumbbellIcon, TrophyIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { cn } from '../../../shared/utils/cn';
import { useWorkoutStore } from '../store/workoutStore';

const octoberWorkoutDays = [1, 3, 5, 6, 8];
const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function WorkoutHistoryScreen() {
  const { navigate } = useNavigation();
  const { history, todayStatus } = useWorkoutStore();
  const trained = todayStatus === 'completed' ? [...octoberWorkoutDays, 9] : octoberWorkoutDays;

  return (
    <Screen title="History" headerRight={<button type="button" onClick={() => navigate('personalRecords')} aria-label="Personal records" className="flex h-11 w-11 items-center justify-center rounded-full"><TrophyIcon size={20} aria-hidden="true" /></button>}>
      <section className="mx-4 rounded-3xl border border-line bg-surface p-4" aria-label="October 2026 calendar">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-ink">October 2026</h2>
          <p className="text-[12px] text-muted">{trained.length} workouts</p>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {days.map((d, i) => <span key={i} className="text-[11px] text-muted">{d}</span>)}
          {Array.from({ length: 3 }).map((_, i) => <span key={`pad-${i}`} />)}
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
            const isTrained = trained.includes(d);
            const isToday = d === 9;
            return (
              <span
                key={d}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-full font-mono text-[12.5px]',
                  isTrained ? 'bg-accent font-semibold text-accentInk' : d > 9 ? 'text-muted/50' : 'text-ink',
                  isToday && !isTrained && 'ring-2 ring-ink'
                )}
                aria-label={`October ${d}${isTrained ? ', workout logged' : ''}`}>
                
                {d}
              </span>);

          })}
        </div>
      </section>

      {history.length === 0 ?
      <EmptyState icon={DumbbellIcon} title="No workouts yet" body="Finish your first session and it’ll show up here with sets, volume and PRs." actionLabel="Start today’s workout" onAction={() => navigate('activeWorkout')} /> :

      <ul className="mt-6 space-y-2 px-4">
          {history.map((w) =>
        <li key={w.id}>
              <button type="button" onClick={() => navigate('workoutHistoryDetail', { id: w.id })} className="w-full rounded-2xl border border-line bg-surface p-4 text-left transition-colors duration-150 hover:bg-surface2/60">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold text-ink">{w.title}</span>
                  <span className="text-[12px] text-muted">{w.date}</span>
                </span>
                <span className="mt-1 block font-mono text-[12.5px] text-muted">
                  {w.durationMin} min{w.volumeKg ? ` · ${w.volumeKg.toLocaleString()} kg` : ''}{w.sets ? ` · ${w.sets} sets` : ''}{w.prs ? ` · ${w.prs} PR` : ''}
                </span>
                <span className="mt-1.5 block">
                  <SourceTag source={w.source === 'Apple Watch' ? { kind: 'synced', label: 'Apple Watch workout' } : { kind: 'manual', label: `Logged in ${w.source === 'Manual' ? 'chat' : 'FitOnus'}` }} />
                </span>
              </button>
            </li>
        )}
        </ul>
      }
    </Screen>);

}