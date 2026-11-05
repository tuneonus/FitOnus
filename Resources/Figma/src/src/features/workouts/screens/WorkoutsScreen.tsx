import React, { useState } from 'react';
import { BookOpenIcon, ChartNoAxesColumnIcon, CheckIcon, ChevronRightIcon, HistoryIcon, PlayIcon, SparklesIcon, TrophyIcon, XIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { Button } from '../../../shared/components/ui/Button';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { showToast } from '../../../shared/stores/toastStore';
import { cn } from '../../../shared/utils/cn';
import { program, weekSchedule, weeklyVolume, workoutCategories } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';

export function WorkoutsScreen() {
  const { navigate } = useNavigation();
  const { plannedSession, todayStatus } = useWorkoutStore();
  const [category, setCategory] = useState<(typeof workoutCategories)[number] | null>(null);

  return (
    <Screen title="Workouts" headerRight={<IconButton icon={HistoryIcon} label="Workout history" onClick={() => navigate('workoutHistory')} />}>
      <div className="space-y-8 px-4 pt-2">
        <section aria-label="This week">
          <ol className="grid grid-cols-7 gap-1.5">
            {weekSchedule.map((d) =>
            <li key={d.date} className={cn('flex flex-col items-center rounded-2xl py-2.5', d.status === 'today' ? 'bg-ink text-bg' : 'bg-surface')}>
                <span className={cn('text-[11px]', d.status === 'today' ? 'text-bg/70' : 'text-muted')}>{d.day}</span>
                <span className="mt-0.5 font-mono text-[16px] font-semibold">{d.date}</span>
                <span className="mt-1.5 flex h-5 items-center">
                  {d.status === 'done' && <CheckIcon size={14} className="text-good" aria-label="Done" />}
                  {d.status === 'missed' && <XIcon size={14} className="text-bad" aria-label="Missed" />}
                  {d.status === 'rest' && <span className="text-[10px] text-muted">Rest</span>}
                  {d.status === 'today' && <span className={cn('h-1.5 w-1.5 rounded-full', todayStatus === 'completed' ? 'bg-good' : 'bg-accent')} aria-label="Today" />}
                </span>
              </li>
            )}
          </ol>
        </section>

        <section className="rounded-3xl border border-line bg-surface p-5" aria-label="Today’s session">
          <p className="text-[12px] font-medium text-muted">{plannedSession.focus}</p>
          <button type="button" onClick={() => navigate('workoutPlan')} className="mt-1 flex w-full items-center justify-between text-left">
            <span className="text-[24px] font-semibold tracking-[-0.02em] text-ink">{plannedSession.title}</span>
            <ChevronRightIcon size={20} className="text-muted" aria-hidden="true" />
          </button>
          <p className="text-[13px] text-muted">
            {plannedSession.durationMin} min · {plannedSession.exercises.length} exercises · {plannedSession.intensity}
          </p>
          <Button size="lg" fullWidth icon={PlayIcon} className="mt-4" disabled={todayStatus === 'completed'} onClick={() => navigate('activeWorkout')}>
            {todayStatus === 'completed' ? 'Completed today' : todayStatus === 'inProgress' ? 'Resume workout' : 'Start workout'}
          </Button>
        </section>

        <section aria-labelledby="program-title">
          <SectionHeader id="program-title" title="Current program" />
          <div className="rounded-3xl border border-line bg-surface p-5">
            <p className="text-[16px] font-semibold text-ink">{program.name}</p>
            <p className="mt-0.5 text-[13px] text-muted">Week {program.week} of {program.totalWeeks} · {program.sessionsDone}/{program.sessionsTotal} sessions</p>
            <ProgressBar value={program.sessionsDone} max={program.sessionsTotal} label="Program progress" barClassName="bg-accentStrong" className="mt-3" />
          </div>
        </section>

        <button
          type="button"
          onClick={() => navigate('workoutGenerator')}
          className="flex w-full items-center gap-4 rounded-3xl bg-hero p-5 text-left text-heroInk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accentInk">
            <SparklesIcon size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">Generate a plan with AI</span>
            <span className="block text-[13px] text-heroMuted">Uses your goal, equipment and today’s recovery</span>
          </span>
          <ChevronRightIcon size={18} className="text-heroMuted" aria-hidden="true" />
        </button>

        <section aria-labelledby="categories-title">
          <SectionHeader id="categories-title" title="Browse plans" />
          <ListGroup>
            {workoutCategories.map((c) =>
            <ListRow key={c.name} title={c.name} subtitle={c.detail} value={`${c.plans}`} onClick={() => setCategory(c)} />
            )}
          </ListGroup>
        </section>

        <section aria-labelledby="volume-title">
          <SectionHeader id="volume-title" title="Weekly volume" action="Analytics" onAction={() => navigate('workoutAnalytics')} />
          <div className="rounded-3xl border border-line bg-surface p-5">
            <BarChart data={weeklyVolume} ariaLabel="Weekly training volume in kilograms" formatValue={(v) => `${v.toLocaleString()} kg`} barClassName="bg-accentStrong" height={110} />
          </div>
        </section>

        <ListGroup>
          <ListRow icon={BookOpenIcon} title="Exercise library" subtitle="Search 14 exercises with form cues" onClick={() => navigate('exerciseLibrary')} />
          <ListRow icon={HistoryIcon} title="Workout history" subtitle="Calendar and past sessions" onClick={() => navigate('workoutHistory')} />
          <ListRow icon={TrophyIcon} title="Personal records" subtitle="5 lifts tracked" onClick={() => navigate('personalRecords')} />
          <ListRow icon={ChartNoAxesColumnIcon} title="Workout analytics" subtitle="Frequency, volume, muscle balance, strength" onClick={() => navigate('workoutAnalytics')} />
        </ListGroup>
      </div>

      <BottomSheet open={Boolean(category)} onClose={() => setCategory(null)} title={category?.name} description={category?.detail}>
        <ul className="space-y-2">
          {['Beginner · 4 weeks', 'Intermediate · 8 weeks', 'Advanced · 12 weeks'].slice(0, Math.min(3, category?.plans ?? 1)).map((p) =>
          <li key={p} className="flex items-center justify-between rounded-2xl border border-line p-4">
              <div>
                <p className="text-[15px] font-semibold text-ink">{category?.name}</p>
                <p className="text-[13px] text-muted">{p}</p>
              </div>
              <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setCategory(null);
                showToast({ message: `${category?.name} saved to your plans` });
              }}>
              
                Save
              </Button>
            </li>
          )}
        </ul>
      </BottomSheet>
    </Screen>);

}