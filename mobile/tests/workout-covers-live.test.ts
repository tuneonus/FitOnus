import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { useWorkoutStore } from '../src/features/workouts/store/workoutStore';
import { plannedSessionFromPlan } from '../src/features/workouts/utils/planned-session';
import type { WorkoutPlanDetailView, WorkoutSession } from '../src/features/workouts/types/workout';

/**
 * The app people actually use is NOT the expo-router `(tabs)` folder: `src/app/index.tsx` renders the custom navigator
 * (`NavigationProvider` + `AppShell`), and `AppShell` draws whichever screen `screenRegistry` maps the current route to.
 * A workout cover that only existed in `(tabs)` would never be seen. These tests pin the live path and then check that
 * the covers are wired into the screens on it.
 */

const SRC = path.join(__dirname, '..', 'src');
const read = (relative: string) => readFileSync(path.join(SRC, relative), 'utf8');
const COVER = 'https://media.example.test/onusfit/workouts/0123456789abcdef0123456789abcdef.webp';

/** Every .ts/.tsx file under src, with a path relative to src (forward slashes). */
function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path.relative(SRC, full).split(path.sep).join('/'));
  }
  return out;
}

const isLegacyRouterFile = (file: string): boolean => /^app\/\((tabs|auth|modals)\)\//.test(file);

const plan = (overrides: Partial<WorkoutPlanDetailView> = {}): WorkoutPlanDetailView => ({
  id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
  userId: null,
  name: 'Full body starter',
  description: 'Three days a week',
  isTemplate: true,
  difficulty: 'beginner',
  estimatedDurationMinutes: 45,
  tags: ['starter'],
  exerciseCount: 2,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  exercises: [
    {
      id: 'we1',
      exerciseId: 'ex1',
      exerciseName: 'Goblet squat',
      targetSets: 3,
      targetReps: '8-12',
      restSeconds: 90,
      category: 'strength',
      primaryMuscle: 'quads',
      equipment: 'dumbbell',
    } as WorkoutPlanDetailView['exercises'][number],
    {
      id: 'we2',
      exerciseId: 'ex2',
      exerciseName: 'Row',
      targetSets: 4,
      targetReps: '10',
      restSeconds: null,
      category: 'strength',
      primaryMuscle: 'back',
      equipment: 'cable',
    } as unknown as WorkoutPlanDetailView['exercises'][number],
  ],
  ...overrides,
});

// -------------------------------------------------------------------------------------------------
describe('the live navigation path (what users actually see)', () => {
  it('the app entry is the custom navigator, not the expo-router tab folder', () => {
    const entry = read('app/index.tsx');
    assert.match(entry, /<NavigationProvider/);
    assert.match(entry, /<AppShell \/>/);
  });

  it('AppShell draws the current route through the screen registry', () => {
    const shell = read('app/AppShell.tsx');
    assert.match(shell, /import \{[^}]*RouteScreen[^}]*\} from '\.\/routes\/screenRegistry'/);
    assert.match(shell, /<RouteScreen name=\{route\.name\} \/>/);
  });

  it('the registry maps the workout routes to the feature screens that this change covers', () => {
    const registry = read('app/routes/screenRegistry.tsx');
    assert.match(registry, /\bworkouts: WorkoutsScreen\b/);
    assert.match(registry, /\bworkoutPlan: WorkoutPlanScreen\b/);
    assert.match(registry, /from '@\/features\/workouts\/screens\/WorkoutsScreen'/);
    assert.match(registry, /from '@\/features\/workouts\/screens\/WorkoutPlanScreen'/);
  });

  it('nothing live imports from the legacy expo-router folders, so they are not reachable from the app', () => {
    for (const file of sourceFiles().filter((f) => !isLegacyRouterFile(f))) {
      if (file === 'app/_layout.tsx' || file === 'app/index.tsx') continue;
      assert.doesNotMatch(read(file), /from ['"][^'"]*\((tabs|auth|modals)\)[^'"]*['"]/, file);
    }
  });

  it('the Training screen and Home both show the planned workout through RecommendedWorkout', () => {
    assert.match(read('features/workouts/screens/WorkoutsScreen.tsx'), /<RecommendedWorkout\b/);
    assert.match(read('features/home/screens/HomeScreen.tsx'), /<RecommendedWorkout\b/);
  });

  it('there is no live "Curated Templates" list or template detail screen: the legacy ones are the only users of the template APIs, EXCEPT that any live file which reads plans must carry the cover', () => {
    const consumers = sourceFiles().filter((file) => {
      if (isLegacyRouterFile(file)) return false;
      // The definitions themselves, not consumers.
      if (/^features\/workouts\/(api\/workout-api|services\/workout-service|types\/workout)\.ts$/.test(file)) return false;
      return /getTemplates\(|getMyWorkouts\(|getWorkoutDetail\(|getWorkoutPlans\(|getWorkoutPlanById\(/.test(read(file));
    });
    // Today the only live reader of a plan is the planned-workout hook. If another screen starts to read plans (a
    // template browser, say), it has to show the cover too: this fails until it does.
    for (const file of consumers) {
      assert.match(
        read(file),
        /plannedSessionFromPlan|WorkoutCover|coverImageUrl/,
        `${file} reads workout plans but does not carry their cover`,
      );
    }
    assert.ok(consumers.includes('features/workouts/hooks/use-planned-workout.ts'));
  });
});

// -------------------------------------------------------------------------------------------------
describe('a planned curated routine carries its cover into the live screens', () => {
  it('maps the cover of a template that has one', () => {
    assert.equal(plannedSessionFromPlan(plan({ coverImageUrl: COVER })).coverImageUrl, COVER);
  });

  it('has no cover for a routine without one, with null, or from an older backend that has no such field', () => {
    assert.equal(plannedSessionFromPlan(plan({ coverImageUrl: null })).coverImageUrl, null);
    assert.equal(plannedSessionFromPlan(plan()).coverImageUrl, null);
  });

  it('keeps only https addresses: anything else never enters the planned session', () => {
    for (const bad of [
      'http://media.example.test/a.webp',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'file:///etc/passwd',
      '//media.example.test/a.webp',
      'onusfit/workouts/0123456789abcdef0123456789abcdef.webp',
      '',
    ]) {
      assert.equal(plannedSessionFromPlan(plan({ coverImageUrl: bad })).coverImageUrl, null, bad);
    }
  });

  it('builds the rest of the planned session exactly as the hook always has', () => {
    const { coverImageUrl, ...rest } = plannedSessionFromPlan(plan({ coverImageUrl: COVER }));
    assert.equal(coverImageUrl, COVER);
    assert.deepEqual(rest, {
      id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
      title: 'Full body starter',
      focus: 'Three days a week',
      durationMin: 45,
      intensity: 'beginner',
      exercises: [
        { exerciseId: 'ex1', sets: 3, reps: '8-12', restSec: 90, weight: 0 },
        { exerciseId: 'ex2', sets: 4, reps: '10', restSec: 0, weight: 0 },
      ],
    });
  });

  it('is not a draft: the hook refetches it like any saved plan', () => {
    assert.equal(plannedSessionFromPlan(plan({ coverImageUrl: COVER })).isDraft, undefined);
  });

  it('handles a template with no description or duration the way it always did', () => {
    const session = plannedSessionFromPlan(plan({ description: null, estimatedDurationMinutes: null }));
    assert.equal(session.focus, '');
    assert.equal(session.durationMin, 0);
  });
});

// -------------------------------------------------------------------------------------------------
describe('the planned session in the store keeps its cover while the member customises it', () => {
  beforeEach(() => {
    useWorkoutStore.setState({ plannedSession: null, todayStatus: 'notStarted' });
  });

  it('removing an exercise (which turns the plan into a draft) leaves the cover in place', () => {
    const session: WorkoutSession = plannedSessionFromPlan(plan({ coverImageUrl: COVER }));
    useWorkoutStore.getState().setPlannedSession(session);
    useWorkoutStore.getState().removePlannedExercise('ex1');
    const after = useWorkoutStore.getState().plannedSession;
    assert.equal(after?.coverImageUrl, COVER);
    assert.equal(after?.isDraft, true);
    assert.deepEqual(after?.exercises.map((e) => e.exerciseId), ['ex2']);
  });

  it('clearing the plan clears the cover with it', () => {
    useWorkoutStore.getState().setPlannedSession(plannedSessionFromPlan(plan({ coverImageUrl: COVER })));
    useWorkoutStore.getState().setPlannedSession(null);
    assert.equal(useWorkoutStore.getState().plannedSession, null);
  });
});

// -------------------------------------------------------------------------------------------------
describe('the live components draw the cover and keep their layouts', () => {
  const card = read('features/home/components/RecommendedWorkout.tsx');
  const planScreen = read('features/workouts/screens/WorkoutPlanScreen.tsx');
  const cover = read('features/workouts/components/workout-cover.tsx');

  it('RecommendedWorkout (Home and Training) shows the planned routine’s cover through the shared component', () => {
    assert.match(card, /import \{ WorkoutCover \} from '@\/features\/workouts\/components\/workout-cover'/);
    assert.match(card, /<WorkoutCover uri=\{plannedSession\?\.coverImageUrl\}/);
  });

  it('it shows the cover only on the planned/in-progress card: not when empty, not for a finished session', () => {
    assert.equal((card.match(/<WorkoutCover/g) ?? []).length, 1);
    assert.match(card, /\{!completed \? <WorkoutCover [^>]*\/> : null\}/);
    // The empty state ("No workout planned") is the first return and contains no cover.
    const emptyState = card.slice(card.indexOf('if (!completed && !inProgress && !hasExercises)'), card.indexOf('return (\n    <View>\n      <SectionHeader'));
    assert.doesNotMatch(emptyState, /WorkoutCover/);
  });

  it('the cover sits inside the card’s padding: the card’s own style, shadow and radius are untouched', () => {
    assert.match(card, /card: \{ padding: 20 \},/);
    assert.match(card, /cover: \{ borderRadius: premium\.radius\.control, marginBottom: 16 \}/);
    assert.doesNotMatch(card, /overflow: 'hidden'/);
    assert.doesNotMatch(card, /marginHorizontal: -/);
  });

  it('the workout plan screen puts the cover first in its header area, ahead of the stats', () => {
    assert.match(planScreen, /import \{ WorkoutCover \} from '\.\.\/components\/workout-cover'/);
    assert.match(planScreen, /<WorkoutCover uri=\{plannedSession\.coverImageUrl\} style=\{styles\.cover\} \/>/);
    const header = planScreen.indexOf('<View style={styles.headerArea}>');
    assert.ok(header > 0);
    assert.ok(planScreen.indexOf('<WorkoutCover', header) > header);
    assert.ok(planScreen.indexOf('<WorkoutCover', header) < planScreen.indexOf('styles.statsGrid', header));
    // The empty state and everything else on the screen are unchanged.
    assert.match(planScreen, /No workout planned/);
    assert.equal((planScreen.match(/<WorkoutCover/g) ?? []).length, 1);
  });

  it('the shared component draws nothing without a safe https cover or when the picture fails, so no gap is left', () => {
    assert.match(cover, /workoutCoverUri\(uri\)/);
    assert.match(cover, /if \(source === null \|\| failedUri === source\) return null;/);
    // The spacing belongs to the picture itself (margins) or to the parent's gap, so it disappears with it.
    assert.match(planScreen, /headerArea: \{\s*gap: 12,/);
  });

  it('it uses the live design tokens: the placeholder is the live surface colour, not a legacy token', () => {
    assert.match(cover, /backgroundColor: colors\.surface2/);
    assert.doesNotMatch(cover, /backgroundSelected/);
  });

  it('the cover is decorative and cropped, never stretched', () => {
    assert.match(cover, /accessible=\{false\}/);
    assert.match(cover, /resizeMode="cover"/);
  });
});
