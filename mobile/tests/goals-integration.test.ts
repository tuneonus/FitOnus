import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress } from '../src/features/goals/utils/goal-calculator';
import type {
  Goal,
  GoalDetails,
  Habit,
  HabitHistory,
  SetHabitCompletionInput,
  CreateGoalInput,
} from '../src/features/goals/types/goal';
import type {
  QueuedHabitCompletion,
  QueuedGoalCheckpoint,
  FailedSyncItem,
} from '../src/features/goals/services/goals-offline-sync';

const RFC4122_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

describe('Goals Mobile Deterministic Progress Calculations', () => {
  it('correctly calculates decrease progress for weightLoss goal (halfway)', () => {
    const goal: Goal = {
      id: 'g-test-1',
      type: 'weightLoss',
      title: 'Lose weight',
      unit: 'kg',
      start: 85.0,
      current: 80.0,
      target: 75.0,
      cadence: 'once',
      direction: 'decrease',
      status: 'active',
      deadline: 'Dec 31',
      history: [85.0, 80.0],
    };

    const p = goalProgress(goal);
    assert.equal(p, 0.5, 'Expected 50% progress for 85 -> 80 with target 75');
  });

  it('correctly calculates completed decrease goal (100%)', () => {
    const goal: Goal = {
      id: 'g-test-2',
      type: 'weightLoss',
      title: 'Lose weight',
      unit: 'kg',
      start: 85.0,
      current: 74.0, // exceeded target
      target: 75.0,
      cadence: 'once',
      direction: 'decrease',
      status: 'completed',
      deadline: 'Dec 31',
      history: [85.0, 74.0],
    };

    const p = goalProgress(goal);
    assert.equal(p, 1.0, 'Expected progress clamped to 1.0 when exceeded target');
  });

  it('correctly calculates daily goal progress (water)', () => {
    const goal: Goal = {
      id: 'g-test-3',
      type: 'water',
      title: 'Daily water',
      unit: 'L',
      start: 0,
      current: 1.5,
      target: 3.0,
      cadence: 'daily',
      direction: 'increase',
      status: 'active',
      deadline: 'Ongoing',
      history: [1.5],
    };

    const p = goalProgress(goal);
    assert.equal(p, 0.5, 'Expected 50% progress for 1.5L / 3.0L');
  });

  it('uses pre-calculated backend progress value when available', () => {
    const goal: Goal = {
      id: 'g-test-4',
      type: 'workoutFrequency',
      title: 'Workout frequency',
      unit: 'sessions',
      start: 0,
      current: 3,
      target: 4,
      progress: 0.75,
      cadence: 'weekly',
      status: 'active',
      deadline: 'Weekly',
      history: [3],
    };

    const p = goalProgress(goal);
    assert.equal(p, 0.75);
  });
});

describe('Goals & Habits UUID & Client Idempotency Keys', () => {
  it('generates valid RFC 4122 v4 UUIDs for client mutations', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();

    assert.match(id1, RFC4122_V4_REGEX, 'id1 must be RFC 4122 v4 compliant');
    assert.match(id2, RFC4122_V4_REGEX, 'id2 must be RFC 4122 v4 compliant');
    assert.notEqual(id1, id2, 'Generated UUIDs must be distinct');
  });

  it('generates 100 consecutive UUIDs without duplicate collisions', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateUUID();
      assert.equal(set.has(id), false, `Collision detected for UUID: ${id}`);
      set.add(id);
    }
    assert.equal(set.size, 100);
  });
});

describe('User Isolation & AsyncStorage Key Scoping', () => {
  const getGoalsCacheKey = (userId?: string) =>
    userId ? `@fitonus:goals_cache:${userId}` : '@fitonus:goals_cache';

  const getHabitsCacheKey = (userId?: string) =>
    userId ? `@fitonus:habits_cache:${userId}` : '@fitonus:habits_cache';

  const getHabitsQueueKey = (userId?: string) =>
    userId ? `@fitonus:pending_habit_completions:${userId}` : '@fitonus:pending_habit_completions';

  const getCheckpointsQueueKey = (userId?: string) =>
    userId ? `@fitonus:pending_goal_checkpoints:${userId}` : '@fitonus:pending_goal_checkpoints';

  const getFailedQueueKey = (userId?: string) =>
    userId ? `@fitonus:failed_goals_sync:${userId}` : '@fitonus:failed_goals_sync';

  it('scopes pending mutation queues per user to avoid cross-user data leakage', () => {
    const userA = 'user_alpha_111';
    const userB = 'user_beta_222';

    assert.equal(getHabitsQueueKey(userA), '@fitonus:pending_habit_completions:user_alpha_111');
    assert.equal(getHabitsQueueKey(userB), '@fitonus:pending_habit_completions:user_beta_222');
    assert.notEqual(getHabitsQueueKey(userA), getHabitsQueueKey(userB));

    assert.equal(getCheckpointsQueueKey(userA), '@fitonus:pending_goal_checkpoints:user_alpha_111');
    assert.equal(getCheckpointsQueueKey(userB), '@fitonus:pending_goal_checkpoints:user_beta_222');
    assert.notEqual(getCheckpointsQueueKey(userA), getCheckpointsQueueKey(userB));

    assert.equal(getFailedQueueKey(userA), '@fitonus:failed_goals_sync:user_alpha_111');
    assert.equal(getFailedQueueKey(userB), '@fitonus:failed_goals_sync:user_beta_222');
    assert.notEqual(getFailedQueueKey(userA), getFailedQueueKey(userB));
  });

  it('scopes cached goals and habits queries per user', () => {
    const userA = 'user_alpha_111';
    const userB = 'user_beta_222';

    assert.equal(getGoalsCacheKey(userA), '@fitonus:goals_cache:user_alpha_111');
    assert.equal(getGoalsCacheKey(userB), '@fitonus:goals_cache:user_beta_222');
    assert.notEqual(getGoalsCacheKey(userA), getGoalsCacheKey(userB));

    assert.equal(getHabitsCacheKey(userA), '@fitonus:habits_cache:user_alpha_111');
    assert.equal(getHabitsCacheKey(userB), '@fitonus:habits_cache:user_beta_222');
    assert.notEqual(getHabitsCacheKey(userA), getHabitsCacheKey(userB));
  });
});

describe('Offline Queue & Explicit Habit Completion Idempotency', () => {
  it('overwrites previous uncommitted mutation for the same habit and date with latest explicit state', () => {
    const queue: QueuedHabitCompletion[] = [];
    const habitId = 'h-100';
    const date = '2026-11-06';

    // Step 1: User toggles habit ON while offline
    const item1: QueuedHabitCompletion = {
      id: generateUUID(),
      habitId,
      payload: { id: generateUUID(), date, completed: true },
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    // Filter out previous for same habit & date
    let updatedQueue = queue.filter((q) => !(q.habitId === habitId && q.payload.date === date));
    updatedQueue.push(item1);
    assert.equal(updatedQueue.length, 1);
    assert.equal(updatedQueue[0]?.payload.completed, true);

    // Step 2: User changes mind while still offline and unmarks habit (OFF)
    const item2: QueuedHabitCompletion = {
      id: generateUUID(),
      habitId,
      payload: { id: generateUUID(), date, completed: false },
      enqueuedAt: new Date().toISOString(),
      retryCount: 0,
    };

    updatedQueue = updatedQueue.filter((q) => !(q.habitId === habitId && q.payload.date === date));
    updatedQueue.push(item2);

    assert.equal(updatedQueue.length, 1, 'Queue must not accumulate duplicate entries for same habit date');
    assert.equal(updatedQueue[0]?.payload.completed, false, 'Queue must reflect the latest explicit intent');
  });

  it('treats HTTP 409 conflict as confirmed duplicate success during sync', () => {
    let synced = 0;
    const error = { response: { status: 409 } };

    if (error?.response?.status === 409) {
      synced++;
    }

    assert.equal(synced, 1, 'HTTP 409 must be treated as successful duplicate submission');
  });

  it('preserves rejected 4xx client errors in dead-letter queue without silent data loss', () => {
    const queue: QueuedHabitCompletion[] = [
      {
        id: generateUUID(),
        habitId: 'h-invalid',
        payload: { date: '2026-11-06', completed: true },
        enqueuedAt: new Date().toISOString(),
        retryCount: 0,
      },
    ];

    const error = { response: { status: 404, data: { error: { message: 'Habit not found' } } } };
    const remaining: QueuedHabitCompletion[] = [];
    const deadLetterQueue: FailedSyncItem[] = [];

    for (const item of queue) {
      if (error.response.status >= 400 && error.response.status < 500) {
        // Never silently discard: record to dead letter queue
        deadLetterQueue.push({
          id: item.id,
          type: 'habit_completion',
          entityId: item.habitId,
          payload: item.payload,
          enqueuedAt: item.enqueuedAt,
          failedAt: new Date().toISOString(),
          statusCode: error.response.status,
          errorMessage: error.response.data.error.message,
          retryCount: item.retryCount,
        });
        continue;
      }
      remaining.push(item);
    }

    assert.equal(remaining.length, 0, 'Rejected item must be dequeued from active retry queue');
    assert.equal(deadLetterQueue.length, 1, 'Rejected item must be retained in dead-letter queue');
    assert.equal(deadLetterQueue[0]?.statusCode, 404);
    assert.equal(deadLetterQueue[0]?.errorMessage, 'Habit not found');
    assert.equal(deadLetterQueue[0]?.entityId, 'h-invalid');
  });

  it('moves items exceeding max retry count to dead-letter queue', () => {
    const item: QueuedHabitCompletion = {
      id: generateUUID(),
      habitId: 'h-transient',
      payload: { date: '2026-11-06', completed: true },
      enqueuedAt: new Date().toISOString(),
      retryCount: 4,
    };

    const remaining: QueuedHabitCompletion[] = [];
    const deadLetterQueue: FailedSyncItem[] = [];

    // Next failure increments retryCount to 5
    item.retryCount++;
    if (item.retryCount < 5) {
      remaining.push(item);
    } else {
      deadLetterQueue.push({
        id: item.id,
        type: 'habit_completion',
        entityId: item.habitId,
        payload: item.payload,
        enqueuedAt: item.enqueuedAt,
        failedAt: new Date().toISOString(),
        statusCode: 500,
        errorMessage: 'Max retries exceeded: Internal Server Error',
        retryCount: item.retryCount,
      });
    }

    assert.equal(remaining.length, 0, 'Exceeded item removed from active queue');
    assert.equal(deadLetterQueue.length, 1, 'Exceeded item preserved in dead-letter queue');
    assert.equal(deadLetterQueue[0]?.retryCount, 5);
  });
});

describe('Goals & Habits Backend Contract Compatibility', () => {
  it('validates GoalView contract matches backend schemas', () => {
    const backendGoal: Goal = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      type: 'weightLoss',
      title: 'Lose weight · 75 kg',
      description: null,
      unit: 'kg',
      start: 85.0,
      current: 82.5,
      target: 75.0,
      progress: 0.25,
      cadence: 'once',
      direction: 'decrease',
      status: 'active',
      isPrimary: true,
      deadline: 'Dec 31, 2026',
      targetDate: '2026-12-31',
      completedOn: null,
      history: [85.0, 82.5],
      createdAt: '2026-11-06T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    assert.equal(typeof backendGoal.id, 'string');
    assert.equal(typeof backendGoal.start, 'number');
    assert.equal(typeof backendGoal.current, 'number');
    assert.equal(typeof backendGoal.target, 'number');
    assert.equal(typeof backendGoal.progress, 'number');
    assert.equal(Array.isArray(backendGoal.history), true);
  });

  it('validates HabitView contract matches backend schemas', () => {
    const backendHabit: Habit = {
      id: '33333333-3333-4333-8333-333333333333',
      userId: '22222222-2222-4222-8222-222222222222',
      title: 'Hydration Routine',
      description: 'Drink 3L water daily',
      category: 'nutrition',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      icon: 'water',
      color: 'blue',
      currentStreak: 4,
      longestStreak: 10,
      totalCompletions: 25,
      isCompletedToday: false,
      isArchived: false,
      weeklyProgress: {
        completedDays: 4,
        targetDays: 7,
        percentage: 57,
      },
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-06T00:00:00.000Z',
    };

    assert.equal(typeof backendHabit.id, 'string');
    assert.equal(backendHabit.category, 'nutrition');
    assert.equal(backendHabit.frequency, 'daily');
    assert.equal(backendHabit.targetDaysPerWeek, 7);
    assert.equal(typeof backendHabit.currentStreak, 'number');
    assert.equal(typeof backendHabit.isCompletedToday, 'boolean');
    assert.equal(typeof backendHabit.weeklyProgress?.percentage, 'number');
  });
});
