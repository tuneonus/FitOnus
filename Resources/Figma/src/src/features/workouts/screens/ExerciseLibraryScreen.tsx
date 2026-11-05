import React, { useState } from 'react';
import { DumbbellIcon, PlusIcon, SearchIcon, SearchXIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { TextField } from '../../../shared/components/ui/TextField';
import { Chip } from '../../../shared/components/ui/Chip';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { showToast } from '../../../shared/stores/toastStore';
import { exercises } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';

const muscles = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body'];

export function ExerciseLibraryScreen() {
  const { navigate, goBack } = useNavigation();
  const { pick } = useRouteParams();
  const { plannedSession, setPlannedSession } = useWorkoutStore();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('All');

  const results = exercises.filter(
    (e) => (muscle === 'All' || e.muscle === muscle) && e.name.toLowerCase().includes(query.toLowerCase())
  );

  const add = (id: string) => {
    if (plannedSession.exercises.some((e) => e.exerciseId === id)) return showToast({ message: 'Already in this workout', tone: 'info' });
    setPlannedSession({ ...plannedSession, exercises: [...plannedSession.exercises, { exerciseId: id, sets: 3, reps: '10', weight: 0, restSec: 60 }] });
    showToast({ message: 'Exercise added' });
    goBack();
  };

  return (
    <Screen title={pick ? 'Add exercise' : 'Exercise library'}>
      <div className="px-4">
        <TextField label="Search exercises" hideLabel placeholder="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} trailing={<SearchIcon size={18} className="text-muted" aria-hidden="true" />} />
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
        {muscles.map((m) => <Chip key={m} selected={muscle === m} onClick={() => setMuscle(m)}>{m}</Chip>)}
      </div>
      {results.length === 0 ?
      <EmptyState icon={SearchXIcon} title="No exercises found" body="Try another name or clear the muscle filter." actionLabel="Clear filters" onAction={() => {setQuery('');setMuscle('All');}} /> :

      <ul className="mt-4 divide-y divide-line px-4">
          {results.map((e) =>
        <li key={e.id} className="flex items-center gap-3 py-3">
              <button type="button" onClick={() => navigate('exerciseDetail', { id: e.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                {e.image ?
            <img src={e.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> :

            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface2"><DumbbellIcon size={20} className="text-muted" aria-hidden="true" /></span>
            }
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">{e.name}</span>
                  <span className="block text-[12.5px] text-muted">{e.muscle} · {e.equipment} · {e.level}</span>
                </span>
              </button>
              {pick &&
          <button type="button" onClick={() => add(e.id)} aria-label={`Add ${e.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accentInk">
                  <PlusIcon size={18} aria-hidden="true" />
                </button>
          }
            </li>
        )}
        </ul>
      }
    </Screen>);

}