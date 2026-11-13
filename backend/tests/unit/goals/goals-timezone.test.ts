import { beforeEach, describe, expect, it } from 'vitest';
import {
  CalculateHabitStreaksUseCase,
  CreateGoalUseCase,
  CreateHabitUseCase,
  GetGoalDetailsUseCase,
  GetHabitHistoryUseCase,
  ListGoalsUseCase,
  ListHabitsUseCase,
  LogGoalCheckpointUseCase,
  SetHabitCompletionUseCase,
  UpdateGoalUseCase,
  UpdateHabitUseCase,
  type Clock,
} from '../../../src/modules/goals/index.js';
import { AppError } from '../../../src/shared/errors/app-error.js';
import { FakeGoalRepository, FakeHabitRepository, RecordingTelemetryPort, makeGoal } from './fakes.js';

/**
 * "Today" must be the user's LOCAL calendar day. Every test fixes the clock; none depends on the machine's
 * timezone or the real date.
 *
 *   BEFORE_IST_MIDNIGHT  2026-11-12T20:00Z  = 2026-11-13 01:30 in Asia/Kolkata, still 2026-11-12 in UTC
 *   SUNDAY_NIGHT_UTC     2026-11-15T19:00Z  = Monday 2026-11-16 00:30 in Asia/Kolkata, still Sunday in UTC
 */
const IST = 'Asia/Kolkata';
const fixed =
  (iso: string): Clock =>
  () =>
    new Date(iso);
const LATE_EVENING_UTC = fixed('2026-11-12T20:00:00Z');
const SUNDAY_NIGHT_UTC = fixed('2026-11-15T19:00:00Z');
const userId = 'user-1';

async function addCompletions(repo: FakeHabitRepository, habitId: string, dates: string[]): Promise<void> {
  for (const date of dates) await repo.setCompletion({ habitId, userId, date, completed: true });
}

describe('goals/habits: "today" is the user local day', () => {
  let goalRepo: FakeGoalRepository;
  let habitRepo: FakeHabitRepository;
  let telemetry: RecordingTelemetryPort;

  beforeEach(() => {
    goalRepo = new FakeGoalRepository();
    habitRepo = new FakeHabitRepository();
    telemetry = new RecordingTelemetryPort();
  });

  async function makeHabit(
    clock: Clock,
    extra: { frequency?: 'daily' | 'weekly'; targetDaysPerWeek?: number } = {},
  ) {
    return new CreateHabitUseCase(habitRepo, clock).execute({ userId, title: 'Stretch', ...extra });
  }

  describe('ListHabitsUseCase', () => {
    it('reports a completion on the 13th as "today" for an IST user at 01:30 IST, but not for a UTC user', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-12']);
      const useCase = new ListHabitsUseCase(habitRepo, LATE_EVENING_UTC);

      const utcView = await useCase.execute({ userId });
      expect(utcView[0]!.isCompletedToday).toBe(true); // 12th is still "today" in UTC

      const istView = await useCase.execute({ userId, timezone: IST });
      expect(istView[0]!.isCompletedToday).toBe(false); // it is already the 13th for this user

      await addCompletions(habitRepo, habit.id, ['2026-11-13']);
      const istAfter = await useCase.execute({ userId, timezone: IST });
      expect(istAfter[0]!.isCompletedToday).toBe(true);
    });

    it('uses an explicit client date as given, whatever the clock or timezone say', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-10']);
      const useCase = new ListHabitsUseCase(habitRepo, LATE_EVENING_UTC);

      for (const timezone of [undefined, IST, 'America/New_York']) {
        const view = await useCase.execute({ userId, date: '2026-11-10', timezone });
        expect(view[0]!.isCompletedToday, String(timezone)).toBe(true);
      }
    });

    it('counts the week from the user local Monday (Monday 00:30 IST is still Sunday in UTC)', async () => {
      const habit = await makeHabit(SUNDAY_NIGHT_UTC);
      // Mon 9th, Tue 10th, Sun 15th (previous week) and Mon 16th (new week)
      await addCompletions(habitRepo, habit.id, ['2026-11-09', '2026-11-10', '2026-11-15', '2026-11-16']);
      const useCase = new ListHabitsUseCase(habitRepo, SUNDAY_NIGHT_UTC);

      const istView = await useCase.execute({ userId, timezone: IST });
      expect(istView[0]!.weeklyProgress!.completedDays).toBe(1); // a brand-new week: only Monday 16th
      expect(istView[0]!.isCompletedToday).toBe(true);

      const utcView = await useCase.execute({ userId });
      expect(utcView[0]!.weeklyProgress!.completedDays).toBe(3); // week of the 9th: 9th, 10th, 15th
      expect(utcView[0]!.isCompletedToday).toBe(true); // 15th
    });

    it('falls back to UTC for an invalid timezone instead of failing', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-12']);
      const useCase = new ListHabitsUseCase(habitRepo, LATE_EVENING_UTC);

      const view = await useCase.execute({ userId, timezone: 'Not/AZone' });
      expect(view[0]!.isCompletedToday).toBe(true);
    });

    it('rejects an impossible explicit date with a validation error', async () => {
      const useCase = new ListHabitsUseCase(habitRepo, LATE_EVENING_UTC);
      await expect(useCase.execute({ userId, date: '2026-02-30' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });

  describe('streak continuity across the IST midnight', () => {
    it('keeps a daily streak unbroken for the IST user who completed the 13th just after local midnight', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      // 23:50 IST on the 12th and 00:10 IST on the 13th: two consecutive local days.
      await addCompletions(habitRepo, habit.id, ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
      const useCase = new CalculateHabitStreaksUseCase(habitRepo, LATE_EVENING_UTC);

      const ist = await useCase.execute({ habitId: habit.id, userId, timezone: IST });
      expect(ist).toEqual({ currentStreak: 4, longestStreak: 4, totalCompletions: 4 });

      // For a UTC user the 13th has not happened yet, so it cannot extend the current streak.
      const utc = await useCase.execute({ habitId: habit.id, userId });
      expect(utc.currentStreak).toBe(3);
      expect(utc.longestStreak).toBe(4);
    });

    it('preserves the streak while "today" is still pending (IST user, nothing logged on the 13th yet)', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-10', '2026-11-11', '2026-11-12']);
      const useCase = new CalculateHabitStreaksUseCase(habitRepo, LATE_EVENING_UTC);

      const ist = await useCase.execute({ habitId: habit.id, userId, timezone: IST });
      expect(ist.currentStreak).toBe(3); // yesterday (12th) completed, today pending => still alive
    });

    it('treats the first completion of the new IST Monday as the start of a new streak week', async () => {
      const habit = await makeHabit(SUNDAY_NIGHT_UTC, { frequency: 'weekly', targetDaysPerWeek: 1 });
      // one completion in each of ISO weeks 45, 46 and (00:10 IST Monday) 47
      await addCompletions(habitRepo, habit.id, ['2026-11-04', '2026-11-10', '2026-11-16']);
      const useCase = new CalculateHabitStreaksUseCase(habitRepo, SUNDAY_NIGHT_UTC);

      const ist = await useCase.execute({ habitId: habit.id, userId, timezone: IST });
      expect(ist.currentStreak).toBe(3);

      const utc = await useCase.execute({ habitId: habit.id, userId });
      expect(utc.currentStreak).toBe(2); // still week 46 in UTC; the Monday completion has not happened
    });

    it('lets an explicit reference date win over the clock', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-01', '2026-11-02']);
      const useCase = new CalculateHabitStreaksUseCase(habitRepo, LATE_EVENING_UTC);

      const asOfThe2nd = await useCase.execute({ habitId: habit.id, userId, referenceDate: '2026-11-02' });
      expect(asOfThe2nd.currentStreak).toBe(2);
    });

    it('computes history streaks from the whole history, not the displayed window', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      const dates: string[] = [];
      for (let d = 1; d <= 12; d++) dates.push(`2026-11-${String(d).padStart(2, '0')}`);
      await addCompletions(habitRepo, habit.id, dates);
      const useCase = new GetHabitHistoryUseCase(habitRepo, LATE_EVENING_UTC);

      const history = await useCase.execute({ habitId: habit.id, userId, limitDays: 5 });
      expect(history.completionDates).toEqual(dates.slice(-5));
      expect(history.streaks.currentStreak).toBe(12);
      expect(history.streaks.totalCompletions).toBe(12);
    });

    it('marks "completed today" in history using the user local day', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-13']);
      const useCase = new GetHabitHistoryUseCase(habitRepo, LATE_EVENING_UTC);

      expect(
        (await useCase.execute({ habitId: habit.id, userId, timezone: IST })).habit.isCompletedToday,
      ).toBe(true);
      expect((await useCase.execute({ habitId: habit.id, userId })).habit.isCompletedToday).toBe(false);
    });
  });

  describe('SetHabitCompletionUseCase / UpdateHabitUseCase', () => {
    it('answers isCompletedToday for the user local day after toggling', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      const useCase = new SetHabitCompletionUseCase(habitRepo, LATE_EVENING_UTC);

      const ist = await useCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-13',
        completed: true,
        timezone: IST,
      });
      expect(ist.habit.isCompletedToday).toBe(true);
      expect(ist.streaks.currentStreak).toBe(1);

      const utc = await useCase.execute({ habitId: habit.id, userId, date: '2026-11-13', completed: true });
      expect(utc.habit.isCompletedToday).toBe(false); // the 13th has not started in UTC
    });

    it('uses the date the client sent for the streak as-of day, and rejects impossible dates', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      const useCase = new SetHabitCompletionUseCase(habitRepo, LATE_EVENING_UTC);

      const res = await useCase.execute({ habitId: habit.id, userId, date: '2026-11-04', completed: true });
      expect(res.date).toBe('2026-11-04');
      expect(res.streaks.currentStreak).toBe(1);

      await expect(
        useCase.execute({ habitId: habit.id, userId, date: '2026-02-30', completed: true }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('counts the week of the toggled day from its Monday', async () => {
      const habit = await makeHabit(SUNDAY_NIGHT_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-09', '2026-11-15']);
      const useCase = new SetHabitCompletionUseCase(habitRepo, SUNDAY_NIGHT_UTC);

      const res = await useCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-16',
        completed: true,
        timezone: IST,
      });
      expect(res.habit.weeklyProgress!.completedDays).toBe(1); // Monday 16th starts a new week
    });

    it('UpdateHabit reports completed-today for the user local day', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      await addCompletions(habitRepo, habit.id, ['2026-11-13']);
      const useCase = new UpdateHabitUseCase(habitRepo, LATE_EVENING_UTC);

      expect(
        (await useCase.execute({ id: habit.id, userId, title: 'Renamed', timezone: IST })).isCompletedToday,
      ).toBe(true);
      expect((await useCase.execute({ id: habit.id, userId, title: 'Renamed' })).isCompletedToday).toBe(
        false,
      );
    });

    it('stamps new habits with the injected clock', async () => {
      const habit = await makeHabit(LATE_EVENING_UTC);
      expect(habit.createdAt).toBe('2026-11-12T20:00:00.000Z');
    });
  });

  describe('goal checkpoints and baselines', () => {
    it('records the baseline checkpoint on the user local day', async () => {
      const create = new CreateGoalUseCase(goalRepo, undefined, LATE_EVENING_UTC);

      const ist = await create.execute({
        userId,
        type: 'custom',
        targetValue: 10,
        startValue: 0,
        timezone: IST,
      });
      const utc = await create.execute({ userId, type: 'custom', targetValue: 10, startValue: 0 });

      const istCheckpoint = goalRepo.checkpoints.find((c) => c.goalId === ist.id)!;
      const utcCheckpoint = goalRepo.checkpoints.find((c) => c.goalId === utc.id)!;
      expect(istCheckpoint.date).toBe('2026-11-13');
      expect(utcCheckpoint.date).toBe('2026-11-12');
      expect(istCheckpoint.recordedAt.toISOString()).toBe('2026-11-12T20:00:00.000Z');
      expect(ist.createdAt).toBe('2026-11-12T20:00:00.000Z');
    });

    it('defaults a checkpoint to the local day but uses an explicit client date as given', async () => {
      await goalRepo.save(makeGoal({ id: 'g1', userId }));
      const log = new LogGoalCheckpointUseCase(goalRepo, LATE_EVENING_UTC);

      const implicit = await log.execute({ goalId: 'g1', userId, value: 1, timezone: IST });
      expect(implicit.date).toBe('2026-11-13');

      const explicit = await log.execute({
        goalId: 'g1',
        userId,
        value: 2,
        date: '2026-11-10',
        timezone: IST,
      });
      expect(explicit.date).toBe('2026-11-10');

      const invalidZone = await log.execute({ goalId: 'g1', userId, value: 3, timezone: 'Not/AZone' });
      expect(invalidZone.date).toBe('2026-11-12');

      await expect(log.execute({ goalId: 'g1', userId, value: 4, date: '2026-02-30' })).rejects.toMatchObject(
        {
          code: 'VALIDATION_FAILED',
        },
      );
    });

    it('records the manual-update checkpoint on the user local day', async () => {
      await goalRepo.save(makeGoal({ id: 'g1', userId, currentValue: 1 }));
      const update = new UpdateGoalUseCase(goalRepo, LATE_EVENING_UTC);

      await update.execute({ id: 'g1', userId, currentValue: 5, timezone: IST });
      expect(goalRepo.checkpoints.at(-1)!.date).toBe('2026-11-13');
      expect(goalRepo.checkpoints.at(-1)!.recordedAt.toISOString()).toBe('2026-11-12T20:00:00.000Z');
    });
  });

  describe('ListGoalsUseCase telemetry and overdue evaluation', () => {
    it('asks telemetry about the user local "today"', async () => {
      await goalRepo.save(makeGoal({ id: 'water', userId, type: 'water', cadence: 'daily', targetValue: 3 }));
      await goalRepo.save(
        makeGoal({ id: 'protein', userId, type: 'protein', cadence: 'daily', targetValue: 120 }),
      );
      await goalRepo.save(
        makeGoal({ id: 'streak', userId, type: 'streak', cadence: 'streak', targetValue: 30 }),
      );
      const list = new ListGoalsUseCase(goalRepo, telemetry, LATE_EVENING_UTC);

      await list.execute({ userId, timezone: IST });
      expect(telemetry.waterDates).toEqual(['2026-11-13']);
      expect(telemetry.nutritionDates).toEqual(['2026-11-13']);
      expect(telemetry.recentWaterRefs).toEqual(['2026-11-13']);
      expect(telemetry.recentProteinRefs).toEqual(['2026-11-13']);
      expect(telemetry.streakCalls).toEqual([{ referenceDate: '2026-11-13', timeZone: IST }]);

      telemetry = new RecordingTelemetryPort();
      await new ListGoalsUseCase(goalRepo, telemetry, LATE_EVENING_UTC).execute({ userId });
      expect(telemetry.waterDates).toEqual(['2026-11-12']);
      expect(telemetry.streakCalls).toEqual([{ referenceDate: '2026-11-12', timeZone: 'UTC' }]);
    });

    it('queries the weekly workout count over the local Monday-Sunday week', async () => {
      await goalRepo.save(
        makeGoal({ id: 'freq', userId, type: 'workoutFrequency', cadence: 'weekly', targetValue: 4 }),
      );

      await new ListGoalsUseCase(goalRepo, telemetry, SUNDAY_NIGHT_UTC).execute({ userId, timezone: IST });
      expect(telemetry.weeklyWindows).toHaveLength(1);
      expect(telemetry.weeklyWindows[0]!.start.toISOString()).toBe('2026-11-15T18:30:00.000Z'); // Mon 16th 00:00 IST
      expect(telemetry.weeklyWindows[0]!.end.toISOString()).toBe('2026-11-22T18:29:59.999Z'); // Sun 22nd 23:59:59.999 IST

      telemetry = new RecordingTelemetryPort();
      await new ListGoalsUseCase(goalRepo, telemetry, SUNDAY_NIGHT_UTC).execute({ userId });
      expect(telemetry.weeklyWindows[0]!.start.toISOString()).toBe('2026-11-09T00:00:00.000Z');
      expect(telemetry.weeklyWindows[0]!.end.toISOString()).toBe('2026-11-15T23:59:59.999Z');
    });

    it('evaluates "overdue" against the user local day', async () => {
      await goalRepo.save(makeGoal({ id: 'due', userId, targetDate: '2026-11-12' }));
      await goalRepo.save(makeGoal({ id: 'open', userId, targetDate: null }));
      await goalRepo.save(makeGoal({ id: 'done', userId, targetDate: '2026-11-01', status: 'completed' }));
      const list = new ListGoalsUseCase(goalRepo, undefined, LATE_EVENING_UTC);
      const byId = (views: Awaited<ReturnType<typeof list.execute>>) => new Map(views.map((v) => [v.id, v]));

      const ist = byId(await list.execute({ userId, timezone: IST }));
      expect(ist.get('due')!.isOverdue).toBe(true); // the 12th is over for an IST user at 01:30 on the 13th
      expect(ist.get('open')!.isOverdue).toBe(false);
      expect(ist.get('done')!.isOverdue).toBe(false);

      const utc = byId(await list.execute({ userId }));
      expect(utc.get('due')!.isOverdue).toBe(false); // still the 12th in UTC: the target day is not over
    });

    it('shows the completion day in the user timezone', async () => {
      await goalRepo.save(
        makeGoal({
          id: 'loss',
          userId,
          type: 'weightLoss',
          direction: 'decrease',
          startValue: 85,
          currentValue: 85,
          targetValue: 80,
        }),
      );
      telemetry.latestWeight = 79.5;
      const list = new ListGoalsUseCase(goalRepo, telemetry, LATE_EVENING_UTC);

      const ist = await list.execute({ userId, timezone: IST });
      expect(ist[0]!.status).toBe('completed');
      expect(ist[0]!.completedOn).toBe('2026-11-13');

      const utc = await list.execute({ userId });
      expect(utc[0]!.completedOn).toBe('2026-11-12');
    });

    it('computes overdue and history reference days in goal details too', async () => {
      await goalRepo.save(
        makeGoal({
          id: 'w',
          userId,
          type: 'water',
          cadence: 'daily',
          targetValue: 3,
          targetDate: '2026-11-12',
        }),
      );
      const details = new GetGoalDetailsUseCase(goalRepo, telemetry, LATE_EVENING_UTC);

      const ist = await details.execute({ id: 'w', userId, timezone: IST });
      expect(ist.goal.isOverdue).toBe(true);
      expect(telemetry.recentWaterRefs).toEqual(['2026-11-13']);
    });

    it('clamps telemetry values that would exceed what a goal can store', async () => {
      await goalRepo.save(makeGoal({ id: 'water', userId, type: 'water', cadence: 'daily', targetValue: 3 }));
      telemetry.waterLiters = 5_000_000;
      const list = new ListGoalsUseCase(goalRepo, telemetry, LATE_EVENING_UTC);

      const [view] = await list.execute({ userId });
      expect(view!.current).toBe(1_000_000);
    });
  });

  it('never throws for a hostile timezone string', async () => {
    const list = new ListHabitsUseCase(habitRepo, LATE_EVENING_UTC);
    for (const timezone of [
      '',
      ' ',
      'UTC+99',
      '../../etc/passwd',
      'a'.repeat(500),
      '\u0000',
      'Asia/Kolkata; DROP TABLE',
    ]) {
      await expect(list.execute({ userId, timezone }), timezone).resolves.toEqual([]);
    }
    expect(AppError).toBeDefined();
  });
});
