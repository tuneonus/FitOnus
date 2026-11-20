import { describe, expect, it } from 'vitest';
import { createFeatureImageUrlResolver } from '../../../src/shared/images/public-image-url.js';
import { newImageKey } from '../../../src/shared/images/image-policy.js';
import { toWorkoutPlanView } from '../../../src/modules/workouts/application/workout-view.js';
import {
  isWorkoutCoverKey,
  NO_WORKOUT_COVER_URLS,
} from '../../../src/modules/workouts/domain/workout-cover.js';
import { WorkoutPlan } from '../../../src/modules/workouts/domain/workout-plan.js';

const ORIGIN = 'https://media.example.test';
const HEX = '0123456789abcdef0123456789abcdef';

const plan = (
  coverImageKey: string | null,
  overrides: { userId?: string | null; isTemplate?: boolean } = {},
) =>
  new WorkoutPlan({
    id: '11111111-1111-4111-8111-111111111111',
    userId: overrides.userId ?? null,
    name: 'Full body starter',
    description: null,
    workoutType: 'strength',
    estimatedDurationMinutes: 45,
    difficulty: 'beginner',
    isTemplate: overrides.isTemplate ?? true,
    isAiGenerated: false,
    tags: [],
    coverImageKey,
    exercises: [],
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    deletedAt: null,
  });

describe('isWorkoutCoverKey', () => {
  it('accepts exactly onusfit/workouts/<32 hex>.webp', () => {
    expect(isWorkoutCoverKey(`onusfit/workouts/${HEX}.webp`)).toBe(true);
    expect(isWorkoutCoverKey(newImageKey('workouts'))).toBe(true);
  });

  it.each([
    ['an exercise key', `onusfit/exercises/${HEX}.webp`],
    ['a notification key', `onusfit/notifications/${HEX}.webp`],
    ['a legacy notification key', `notifications/${HEX}.jpg`],
    ['a URL', `${ORIGIN}/onusfit/workouts/${HEX}.webp`],
    ['a derivative', `onusfit/workouts/${HEX}.push.jpg`],
    ['path traversal', 'onusfit/workouts/../../etc/passwd'],
    ['a private-looking path', `onusfit/avatars/${HEX}.webp`],
    ['an empty string', ''],
    ['a number', 7],
    ['null', null],
  ])('refuses %s', (_name, value) => {
    expect(isWorkoutCoverKey(value)).toBe(false);
  });
});

describe('a workout plan view and its cover', () => {
  const resolve = createFeatureImageUrlResolver(ORIGIN, 'workouts');

  it('builds the public URL from the trusted origin and the key', () => {
    const key = `onusfit/workouts/${HEX}.webp`;
    const view = toWorkoutPlanView(plan(key), false, resolve);
    expect(view.coverImageKey).toBe(key);
    expect(view.coverImageUrl).toBe(`${ORIGIN}/${key}`);
  });

  it('has no cover by default: both fields are null, never undefined', () => {
    const view = toWorkoutPlanView(plan(null), true, resolve);
    expect(view.coverImageKey).toBeNull();
    expect(view.coverImageUrl).toBeNull();
    expect(JSON.parse(JSON.stringify(view))).toMatchObject({ coverImageKey: null, coverImageUrl: null });
  });

  it('shows no cover URL when media storage is not configured, but still reports the key to the admin', () => {
    const key = `onusfit/workouts/${HEX}.webp`;
    const view = toWorkoutPlanView(plan(key), false, NO_WORKOUT_COVER_URLS);
    expect(view.coverImageUrl).toBeNull();
    expect(view.coverImageKey).toBe(key);
  });

  it('never turns another feature’s key, or a URL, into a cover URL', () => {
    for (const stored of [
      `onusfit/exercises/${HEX}.webp`,
      `onusfit/notifications/${HEX}.webp`,
      'https://evil.example/pixel.png',
    ]) {
      expect(toWorkoutPlanView(plan(stored), false, resolve).coverImageUrl).toBeNull();
    }
  });

  it('keeps every existing field of the view', () => {
    const view = toWorkoutPlanView(plan(null));
    expect(Object.keys(view)).toEqual(
      expect.arrayContaining([
        'id',
        'userId',
        'name',
        'description',
        'workoutType',
        'estimatedDurationMinutes',
        'difficulty',
        'isTemplate',
        'isAiGenerated',
        'tags',
        'exercisesCount',
        'createdAt',
        'updatedAt',
      ]),
    );
  });
});
