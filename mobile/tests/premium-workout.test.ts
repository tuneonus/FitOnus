import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterExercises,
  parseWorkoutInput,
  historyForPresentation,
} from '../src/features/workouts/utils/premium-workout';
import type { Exercise } from '../src/features/workouts/types/workout';
const exercises: Exercise[] = [
  { id: 'one', name: 'Bench Press', muscle: 'Chest', equipment: 'Barbell', level: 'Beginner' },
  { id: 'two', name: 'Dumbbell Press', primaryMuscles: ['chest'], equipment: 'Dumbbell' },
  { id: 'three', name: 'Squat', muscle: 'Legs', equipment: 'Barbell' },
];
describe('Premium exercise discovery', () => {
  it('combines search, muscle and equipment filters rather than ignoring equipment', () => {
    assert.deepEqual(
      filterExercises(exercises, 'press', 'Chest', 'Dumbbell').map((e) => e.id),
      ['two'],
    );
  });
  it('handles trimmed case-insensitive query and alternate muscle metadata', () => {
    assert.deepEqual(
      filterExercises(exercises, ' PRESS ', 'chest', 'barbell').map((e) => e.id),
      ['one'],
    );
  });
  it('clearing all filters restores the actual catalog without manufacturing exercises', () => {
    assert.deepEqual(filterExercises(exercises, '', 'All', 'All'), exercises);
    assert.deepEqual(filterExercises([], '', 'All', 'All'), []);
    assert.deepEqual(filterExercises(exercises, 'missing', 'All', 'All'), []);
  });
});
describe('Direct workout entry keeps incomplete edits out of stored calculations', () => {
  it('accepts decimal kilograms, comma decimals, bodyweight zero and whole reps', () => {
    assert.equal(parseWorkoutInput('72.5'), 72.5);
    assert.equal(parseWorkoutInput('72,5'), 72.5);
    assert.equal(parseWorkoutInput('.5'), 0.5);
    assert.equal(parseWorkoutInput('0'), 0);
    assert.equal(parseWorkoutInput('12', true), 12);
  });
  it('rejects blank, negative, exponent, non-finite and nonnumeric edits', () => {
    for (const input of ['', ' ', '-', '-5', '.', '1e3', 'Infinity', 'NaN', '7kg', '2..5'])
      assert.equal(parseWorkoutInput(input), null);
  });
  it('rejects fractional or unsafe rep counts without rounding a logged set', () => {
    assert.equal(parseWorkoutInput('10.5', true), null);
    assert.equal(parseWorkoutInput('9007199254740992', true), null);
    assert.equal(parseWorkoutInput('0', true), 0);
  });
});

describe('Workout history presentation', () => {
  const remote = {
    id: 'server',
    clientSessionId: 'client',
    completedAt: '2026-11-09T04:00:00Z',
    workoutName: 'Logged workout',
    durationSeconds: 1800,
    totalVolumeKg: 1250,
    totalSets: 10,
    estimatedCaloriesBurned: 225,
  };
  const local = {
    id: 'client',
    clientSessionId: 'client',
    date: 'Today',
    title: 'Logged workout',
    durationMin: 30,
    volumeKg: 1250,
    sets: 10,
    prs: 1,
    calories: 225,
    source: 'FitOnus' as const,
    pendingSync: true,
    exercises: [{ name: 'Bench press', best: '50 kg × 5' }],
  };
  it('deduplicates confirmed client sessions and retains their exercise details', () => {
    const logs = historyForPresentation([remote], [local]);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.id, 'server');
    assert.deepEqual(logs[0]?.exercises, local.exercises);
    assert.equal(logs[0]?.prs, 1);
  });
  it('preserves unconfirmed offline sessions alongside real server records', () => {
    const logs = historyForPresentation(
      [remote],
      [{ ...local, id: 'offline', clientSessionId: 'offline' }],
    );
    assert.equal(logs.length, 2);
    assert.equal(logs[0]?.pendingSync, true);
  });
  it('keeps the full observed timestamp without inventing a calendar year', () => {
    const log = historyForPresentation([remote], [])[0]!;
    assert.equal(log.completedAt, remote.completedAt);
    assert.match(log.date, /2026/);
    assert.equal(
      historyForPresentation([{ ...remote, completedAt: '' }], [])[0]?.date,
      'Date unavailable',
    );
  });
});
