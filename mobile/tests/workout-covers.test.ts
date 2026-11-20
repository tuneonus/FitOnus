import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { workoutApi } from '../src/features/workouts/api/workout-api';
import { WorkoutService } from '../src/features/workouts/services/workout-service';
import { workoutCoverUri } from '../src/features/workouts/utils/workout-cover';
import type {
  WorkoutPlanDetailView,
  WorkoutPlanSummaryView,
} from '../src/features/workouts/types/workout';

const COVER = 'https://media.example.test/onusfit/workouts/0123456789abcdef0123456789abcdef.webp';
const read = (relative: string) => readFileSync(path.join(__dirname, '..', 'src', relative), 'utf8');

const summary = (overrides: Partial<WorkoutPlanSummaryView> = {}): WorkoutPlanSummaryView => ({
  id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
  userId: null,
  name: 'Full body starter',
  description: 'Three days a week',
  isTemplate: true,
  difficulty: 'beginner',
  estimatedDurationMinutes: 45,
  tags: ['starter'],
  exerciseCount: 4,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  ...overrides,
});

describe('workoutCoverUri: only a safe https picture is ever shown', () => {
  it('passes through an https address', () => {
    assert.equal(workoutCoverUri(COVER), COVER);
    assert.equal(workoutCoverUri(`  ${COVER}  `), COVER);
  });

  it('shows nothing for no cover, whatever shape "none" takes', () => {
    for (const none of [null, undefined, '', '   ', 0, {}, [], true]) {
      assert.equal(workoutCoverUri(none), null, String(none));
    }
  });

  it('refuses anything that is not an absolute https address', () => {
    for (const bad of [
      'http://media.example.test/a.webp', // a release Android build does not load cleartext images
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'file:///etc/passwd',
      'ftp://media.example.test/a.webp',
      '//media.example.test/a.webp',
      '/onusfit/workouts/a.webp',
      'onusfit/workouts/0123456789abcdef0123456789abcdef.webp', // a key is not an address
      'not a url',
      'https://',
    ]) {
      assert.equal(workoutCoverUri(bad), null, bad);
    }
  });

  it('refuses an absurdly long address', () => {
    assert.equal(workoutCoverUri(`https://media.example.test/${'a'.repeat(2100)}`), null);
  });
});

describe('workout covers reach the card and the detail screen through the service', () => {
  const originalPlans = workoutApi.getWorkoutPlans;
  const originalPlanById = workoutApi.getWorkoutPlanById;
  afterEach(() => {
    workoutApi.getWorkoutPlans = originalPlans;
    workoutApi.getWorkoutPlanById = originalPlanById;
  });

  const stubPlans = (plans: WorkoutPlanSummaryView[]) => {
    workoutApi.getWorkoutPlans = async () => ({ plans, total: plans.length, page: 1, totalPages: 1 });
  };

  it('a curated template carries its cover address into the card model', async () => {
    stubPlans([summary({ coverImageUrl: COVER })]);
    const [card] = await WorkoutService.getTemplates();
    assert.equal(card.coverImageUrl, COVER);
    // The rest of the card model is exactly what it was before covers.
    assert.deepEqual(
      { ...card, coverImageUrl: undefined },
      {
        id: '8f4b3a64-1d1c-4c3e-8e69-5d3d2f9c7a01',
        name: 'Full body starter',
        description: 'Three days a week',
        estimatedDuration: 45,
        difficulty: 'Beginner',
        tags: ['starter'],
        exercisesCount: 4,
        isAiGenerated: false,
        coverImageUrl: undefined,
      },
    );
  });

  it('a template without a cover, or from a backend that predates covers, has coverImageUrl: null', async () => {
    stubPlans([summary({ coverImageUrl: null }), summary({ id: '2' })]);
    const cards = await WorkoutService.getTemplates();
    assert.deepEqual(
      cards.map((c) => c.coverImageUrl),
      [null, null],
    );
    assert.equal(workoutCoverUri(cards[0].coverImageUrl), null);
  });

  it('the member’s own routines map the same way and have no cover', async () => {
    stubPlans([summary({ isTemplate: false, userId: 'u1', coverImageUrl: null })]);
    const [mine] = await WorkoutService.getMyWorkouts();
    assert.equal(mine.coverImageUrl, null);
  });

  it('the detail model carries the cover too, with its exercises intact', async () => {
    const detail: WorkoutPlanDetailView = {
      ...summary({ coverImageUrl: COVER }),
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
      ],
    };
    workoutApi.getWorkoutPlanById = async () => detail;
    const result = await WorkoutService.getWorkoutDetail(detail.id);
    assert.equal(result.coverImageUrl, COVER);
    assert.equal(result.exercises.length, 1);
    assert.equal(result.exercises[0].exercise.name, 'Goblet squat');
  });

  it('a failed list request still gives an empty list, never a half-built card', async () => {
    workoutApi.getWorkoutPlans = async () => {
      throw new Error('offline');
    };
    assert.deepEqual(await WorkoutService.getTemplates(), []);
  });
});

describe('workout covers: how the screens use them', () => {
  const card = read('features/workouts/components/workout-card.tsx');
  const detail = read('app/(tabs)/workouts/[id]/index.tsx');
  const cover = read('features/workouts/components/workout-cover.tsx');

  it('the card and the detail screen both draw the cover through the shared component', () => {
    assert.match(card, /<WorkoutCover uri=\{workout\.coverImageUrl\}/);
    assert.match(detail, /<WorkoutCover uri=\{workout\.coverImageUrl\}/);
  });

  it('the shared component renders nothing without a safe cover, or when the picture fails to load', () => {
    assert.match(cover, /workoutCoverUri\(uri\)/);
    assert.match(cover, /if \(source === null \|\| failedUri === source\) return null;/);
    assert.match(cover, /onError=\{\(\) => setFailedUri\(source\)\}/);
  });

  it('the cover is decorative: hidden from screen readers', () => {
    assert.match(cover, /accessible=\{false\}/);
    assert.match(cover, /importantForAccessibility="no"/);
  });

  it('the cover is cropped to fit, never stretched', () => {
    assert.match(cover, /resizeMode="cover"/);
    assert.match(cover, /aspectRatio: 16 \/ 9/);
  });
});

describe('meal photos stay transient (nothing keeps them)', () => {
  const privacy = read('features/settings/screens/PrivacyScreen.tsx');
  const store = read('shared/stores/settingsStore.ts');
  const mealPhoto = read('features/nutrition/screens/MealPhotoScreen.tsx');
  const mealAnalysis = read('features/nutrition/screens/MealAnalysisScreen.tsx');

  it('the privacy screen no longer offers the misleading "Keep meal photos" switch', () => {
    assert.doesNotMatch(privacy, /title: 'Keep meal photos'/);
    assert.doesNotMatch(privacy, /key: 'privacyPhotoRetention'/);
    assert.doesNotMatch(privacy, /useSettingsStore\(\(s\) => s\.privacyPhotoRetention\)/);
    // Its explanation stays next to where the switch used to be.
    assert.match(privacy, /Meal photos are never stored/);
  });

  it('the stored preference and its sync are untouched, so nothing is lost if retention is ever built', () => {
    assert.match(store, /privacyPhotoRetention: boolean;/);
    assert.match(store, /privacyPhotoRetention: true,/);
    assert.match(store, /serverSettings\.privacyPhotoRetention/);
  });

  it('the analysis and capture screens write the photo nowhere: not to a file, the library, storage or an API other than analysis', () => {
    for (const source of [mealPhoto, mealAnalysis]) {
      assert.doesNotMatch(source, /expo-file-system|expo-media-library|saveToLibrary|AsyncStorage|SecureStore|writeAsStringAsync|copyAsync|moveAsync/);
    }
    // The picker returns a temporary file and the base64 is only passed along as screen parameters.
    assert.match(mealPhoto, /imageBase64: asset\.base64 \?\? ''/);
  });
});
