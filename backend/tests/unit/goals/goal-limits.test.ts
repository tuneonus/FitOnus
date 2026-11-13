import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_SOURCE_MAX_LENGTH,
  CreateGoalUseCase,
  GOAL_DEADLINE_LABEL_MAX_LENGTH,
  GOAL_METRIC_UNIT_MAX_LENGTH,
  GOAL_TITLE_MAX_LENGTH,
  GOAL_VALUE_MAX,
  Goal,
  HABIT_COLOR_MAX_LENGTH,
  HABIT_ICON_MAX_LENGTH,
  HABIT_TITLE_MAX_LENGTH,
  LogGoalCheckpointUseCase,
  UpdateGoalUseCase,
  CreateHabitUseCase,
  assertCalendarDate,
  assertGoalValue,
  assertHabitTargetDays,
  assertMaxLength,
  clampGoalValue,
} from '../../../src/modules/goals/index.js';
import { NUMERIC_10_2_CAPACITY } from '../../../src/modules/goals/domain/goal-limits.js';
import {
  createGoalRequest,
  createHabitRequest,
  logGoalCheckpointRequest,
  setHabitCompletionRequest,
  updateGoalRequest,
  updateHabitRequest,
} from '../../../src/modules/goals/interface/goals.schemas.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { FakeGoalRepository, FakeHabitRepository, makeGoal } from './fakes.js';

const userId = 'user-1';

describe('goal limits stay strictly inside the PostgreSQL columns (migration 0010)', () => {
  it('GOAL_VALUE_MAX is far below numeric(10,2) capacity', () => {
    // numeric(10,2) holds |x| < 10^8
    expect(NUMERIC_10_2_CAPACITY).toBe(10 ** 8);
    expect(GOAL_VALUE_MAX).toBeLessThan(NUMERIC_10_2_CAPACITY);
    expect(GOAL_VALUE_MAX + 0.01).toBeLessThan(NUMERIC_10_2_CAPACITY);
  });

  it('text limits never exceed the varchar sizes of the columns they feed', () => {
    expect(GOAL_TITLE_MAX_LENGTH).toBeLessThanOrEqual(150); // goals.title varchar(150)
    expect(GOAL_METRIC_UNIT_MAX_LENGTH).toBeLessThanOrEqual(30); // goals.metric_unit varchar(30)
    expect(GOAL_DEADLINE_LABEL_MAX_LENGTH).toBeLessThanOrEqual(50); // goals.deadline_label varchar(50)
    expect(CHECKPOINT_SOURCE_MAX_LENGTH).toBeLessThanOrEqual(30); // goal_checkpoints.source varchar(30)
    expect(HABIT_TITLE_MAX_LENGTH).toBeLessThanOrEqual(150); // habits.title varchar(150)
    expect(HABIT_ICON_MAX_LENGTH).toBeLessThanOrEqual(50); // habits.icon varchar(50)
    expect(HABIT_COLOR_MAX_LENGTH).toBeLessThanOrEqual(30); // habits.color varchar(30)
  });
});

describe('assertGoalValue', () => {
  const expectValidation = (fn: () => void) => {
    try {
      fn();
      throw new Error('expected a validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION_FAILED');
      expect((error as AppError).kind).toBe('unprocessable');
    }
  };

  it('accepts 0 and the maximum', () => {
    expect(() => assertGoalValue('v', 0)).not.toThrow();
    expect(() => assertGoalValue('v', GOAL_VALUE_MAX)).not.toThrow();
  });

  it('rejects one step above the maximum, negatives, NaN, Infinity and non-numbers', () => {
    expectValidation(() => assertGoalValue('v', GOAL_VALUE_MAX + 0.01));
    expectValidation(() => assertGoalValue('v', 99_999_999.99)); // would still fit the column; not a real goal
    expectValidation(() => assertGoalValue('v', 1e300));
    expectValidation(() => assertGoalValue('v', -0.01));
    expectValidation(() => assertGoalValue('v', Number.NaN));
    expectValidation(() => assertGoalValue('v', Number.POSITIVE_INFINITY));
    expectValidation(() => assertGoalValue('v', '5'));
    expectValidation(() => assertGoalValue('v', null));
  });

  it('clampGoalValue keeps telemetry values writable', () => {
    expect(clampGoalValue(5)).toBe(5);
    expect(clampGoalValue(5_000_000)).toBe(GOAL_VALUE_MAX);
    expect(clampGoalValue(-3)).toBe(0);
    expect(clampGoalValue(Number.NaN)).toBe(0);
  });

  it('assertMaxLength / assertCalendarDate / assertHabitTargetDays', () => {
    expect(() => assertMaxLength('f', 'a'.repeat(30), 30)).not.toThrow();
    expectValidation(() => assertMaxLength('f', 'a'.repeat(31), 30));
    expect(() => assertMaxLength('f', undefined, 30)).not.toThrow();
    expect(() => assertCalendarDate('d', null)).not.toThrow();
    expect(() => assertCalendarDate('d', '2028-02-29')).not.toThrow();
    expectValidation(() => assertCalendarDate('d', '2027-02-29'));
    expect(() => assertHabitTargetDays(7)).not.toThrow();
    expectValidation(() => assertHabitTargetDays(8));
    expectValidation(() => assertHabitTargetDays(3.5));
  });
});

describe('Goal domain mutators enforce the limits', () => {
  it('updateProgress / updateDetails refuse values past the maximum but hydration stays lenient', () => {
    // A legacy row above the limit (still inside numeric(10,2)) must remain readable.
    const legacy = makeGoal({ startValue: 5_000_000, currentValue: 5_000_000, targetValue: 6_000_000 });
    expect(legacy.targetValue).toBe(6_000_000);

    const goal = makeGoal();
    expect(() => goal.updateProgress(GOAL_VALUE_MAX)).not.toThrow();
    expect(() => goal.updateProgress(GOAL_VALUE_MAX + 1)).toThrow(AppError);
    expect(() => goal.updateDetails({ targetValue: GOAL_VALUE_MAX + 1 })).toThrow(AppError);
    expect(() => goal.updateProgress(-1)).toThrow('Progress value cannot be negative');
  });

  it('refuses non-finite values at construction', () => {
    expect(() => makeGoal({ targetValue: Number.NaN })).toThrow('finite');
    expect(() => makeGoal({ currentValue: Number.POSITIVE_INFINITY })).toThrow('finite');
    expect(Goal).toBeDefined();
  });
});

describe('use cases reject out-of-range numbers with a validation error instead of reaching PostgreSQL', () => {
  it('CreateGoal: values at the bound pass, one step above fails', async () => {
    const repo = new FakeGoalRepository();
    const create = new CreateGoalUseCase(repo);

    const ok = await create.execute({
      userId,
      type: 'custom',
      targetValue: GOAL_VALUE_MAX,
      startValue: GOAL_VALUE_MAX,
    });
    expect(ok.target).toBe(GOAL_VALUE_MAX);

    await expect(
      create.execute({ userId, type: 'custom', targetValue: GOAL_VALUE_MAX + 0.01 }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(
      create.execute({ userId, type: 'custom', targetValue: 10, startValue: GOAL_VALUE_MAX + 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(create.execute({ userId, type: 'custom', targetValue: Number.NaN })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(
      create.execute({ userId, type: 'custom', targetValue: 10, targetDate: '2026-02-30' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      create.execute({ userId, type: 'custom', targetValue: 10, metricUnit: 'u'.repeat(31) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      create.execute({ userId, type: 'custom', targetValue: 10, title: 't'.repeat(151) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('UpdateGoal and LogGoalCheckpoint check only the values being written', async () => {
    const repo = new FakeGoalRepository();
    await repo.save(makeGoal({ id: 'g', userId }));
    const update = new UpdateGoalUseCase(repo);
    const log = new LogGoalCheckpointUseCase(repo);

    await expect(update.execute({ id: 'g', userId, currentValue: GOAL_VALUE_MAX })).resolves.toBeDefined();
    await expect(update.execute({ id: 'g', userId, currentValue: GOAL_VALUE_MAX + 1 })).rejects.toMatchObject(
      {
        code: 'VALIDATION_FAILED',
      },
    );
    await expect(update.execute({ id: 'g', userId, targetValue: GOAL_VALUE_MAX + 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(log.execute({ goalId: 'g', userId, value: GOAL_VALUE_MAX })).resolves.toBeDefined();
    await expect(log.execute({ goalId: 'g', userId, value: GOAL_VALUE_MAX + 1 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(
      log.execute({ goalId: 'g', userId, value: 1, source: 's'.repeat(31) }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('CreateHabit rejects fractional targetDaysPerWeek and oversize text', async () => {
    const create = new CreateHabitUseCase(new FakeHabitRepository());
    await expect(
      create.execute({ userId, title: 'x', frequency: 'weekly', targetDaysPerWeek: 3.5 }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(create.execute({ userId, title: 'x', color: 'c'.repeat(31) })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(create.execute({ userId, title: 'x', color: 'c'.repeat(30) })).resolves.toBeDefined();
  });
});

describe('request schemas', () => {
  const goalBody = createGoalRequest.body;

  it('accepts values at the bound and rejects one step above, NaN and Infinity', () => {
    expect(goalBody.safeParse({ type: 'custom', targetValue: GOAL_VALUE_MAX }).success).toBe(true);
    expect(goalBody.safeParse({ type: 'custom', targetValue: GOAL_VALUE_MAX + 0.01 }).success).toBe(false);
    expect(goalBody.safeParse({ type: 'custom', targetValue: 99_999_999 }).success).toBe(false);
    expect(goalBody.safeParse({ type: 'custom', targetValue: Number.NaN }).success).toBe(false);
    expect(goalBody.safeParse({ type: 'custom', targetValue: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(goalBody.safeParse({ type: 'custom', targetValue: 1e308 }).success).toBe(false);
    expect(
      goalBody.safeParse({ type: 'custom', targetValue: 10, startValue: GOAL_VALUE_MAX + 1 }).success,
    ).toBe(false);
  });

  it('applies the same bound to update, checkpoint and progress inputs', () => {
    expect(updateGoalRequest.body.safeParse({ currentValue: GOAL_VALUE_MAX }).success).toBe(true);
    expect(updateGoalRequest.body.safeParse({ currentValue: GOAL_VALUE_MAX + 1 }).success).toBe(false);
    expect(updateGoalRequest.body.safeParse({ targetValue: GOAL_VALUE_MAX + 1 }).success).toBe(false);
    expect(logGoalCheckpointRequest.body.safeParse({ value: GOAL_VALUE_MAX }).success).toBe(true);
    expect(logGoalCheckpointRequest.body.safeParse({ value: GOAL_VALUE_MAX + 1 }).success).toBe(false);
  });

  it('rejects impossible calendar dates (the regex alone would pass them)', () => {
    for (const date of ['2026-02-30', '2026-13-01', '0000-01-01', '2026-04-31']) {
      expect(goalBody.safeParse({ type: 'custom', targetValue: 1, targetDate: date }).success, date).toBe(
        false,
      );
      expect(logGoalCheckpointRequest.body.safeParse({ value: 1, date }).success, date).toBe(false);
      expect(setHabitCompletionRequest.body.safeParse({ date, completed: true }).success, date).toBe(false);
    }
    expect(setHabitCompletionRequest.body.safeParse({ date: '2028-02-29', completed: true }).success).toBe(
      true,
    );
  });

  it('caps text at the varchar sizes of the columns (these used to overflow with a 500)', () => {
    expect(logGoalCheckpointRequest.body.safeParse({ value: 1, source: 's'.repeat(30) }).success).toBe(true);
    expect(logGoalCheckpointRequest.body.safeParse({ value: 1, source: 's'.repeat(31) }).success).toBe(false);
    expect(createHabitRequest.body.safeParse({ title: 'x', color: 'c'.repeat(30) }).success).toBe(true);
    expect(createHabitRequest.body.safeParse({ title: 'x', color: 'c'.repeat(31) }).success).toBe(false);
    expect(updateHabitRequest.body.safeParse({ color: 'c'.repeat(31) }).success).toBe(false);
    expect(goalBody.safeParse({ type: 'custom', targetValue: 1, metricUnit: 'u'.repeat(31) }).success).toBe(
      false,
    );
  });

  it('accepts an optional timezone query and never rejects an unknown zone', () => {
    expect(createGoalRequest.query.safeParse({ timezone: 'Asia/Kolkata' }).success).toBe(true);
    expect(createGoalRequest.query.safeParse({ timezone: 'Not/AZone' }).success).toBe(true);
    expect(createGoalRequest.query.safeParse({}).success).toBe(true);
    expect(createGoalRequest.query.safeParse({ timezone: 'x'.repeat(65) }).success).toBe(false);
  });
});
