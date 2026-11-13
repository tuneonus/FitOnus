import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Database, PgUnitOfWork } from '../../../src/database/transaction.js';
import {
  CalculateHabitStreaksUseCase,
  CreateGoalUseCase,
  CreateHabitUseCase,
  ListGoalsUseCase,
  ListHabitsUseCase,
  PgGoalRepository,
  PgGoalsTelemetryAdapter,
  PgHabitRepository,
  SetHabitCompletionUseCase,
  type Clock,
} from '../../../src/modules/goals/index.js';
import {
  GetDailyNutritionUseCase,
  GetNutritionAnalyticsUseCase,
  LogMealUseCase,
  LogWaterUseCase,
  PgFoodRepository,
  PgMealRepository,
  PgUserProfileTargetAdapter,
  PgWaterRepository,
} from '../../../src/modules/nutrition/index.js';
import { seedUser, type SeededUser } from '../../helpers/test-app.js';
import { createTestDatabase, type TestDatabase } from '../../helpers/test-database.js';

/**
 * Real PostgreSQL, fixed clocks. The same instant is a different calendar day for an IST user and a UTC user:
 *   LATE_EVENING_UTC  2026-11-12T20:00Z = 2026-11-13 01:30 IST, still the 12th in UTC
 *   SUNDAY_NIGHT_UTC  2026-11-15T19:00Z = Monday 2026-11-16 00:30 IST, still Sunday in UTC
 * Nothing here depends on the machine timezone, the database session timezone or the real date.
 */
const IST = 'Asia/Kolkata';
const fixed =
  (iso: string): Clock =>
  () =>
    new Date(iso);
const LATE_EVENING_UTC = fixed('2026-11-12T20:00:00Z');
const SUNDAY_NIGHT_UTC = fixed('2026-11-15T19:00:00Z');

describe('goals + nutrition "today" against real PostgreSQL', () => {
  let db: TestDatabase;
  let database: Database;
  let uow: PgUnitOfWork;
  let user: SeededUser;

  let goalRepo: PgGoalRepository;
  let habitRepo: PgHabitRepository;
  let telemetry: PgGoalsTelemetryAdapter;
  let mealRepo: PgMealRepository;
  let waterRepo: PgWaterRepository;
  let foodRepo: PgFoodRepository;
  let targetPort: PgUserProfileTargetAdapter;

  beforeAll(async () => {
    db = await createTestDatabase();
    database = new Database(db.pool);
    uow = new PgUnitOfWork(database);
    user = await seedUser(db.pool, { email: 'timezone-user@example.com' });

    goalRepo = new PgGoalRepository(database);
    habitRepo = new PgHabitRepository(database);
    telemetry = new PgGoalsTelemetryAdapter(database);
    mealRepo = new PgMealRepository(database);
    waterRepo = new PgWaterRepository(database);
    foodRepo = new PgFoodRepository(database);
    targetPort = new PgUserProfileTargetAdapter(database);
  });

  afterAll(async () => {
    await db.drop();
  });

  const text = async (sql: string, params: unknown[] = []) => (await db.pool.query(sql, params)).rows;

  describe('habits', () => {
    it('getCompletionDates returns the NEWEST rows (it used to return the oldest)', async () => {
      const habit = await new CreateHabitUseCase(habitRepo, LATE_EVENING_UTC).execute({
        userId: user.id,
        title: 'Run',
      });
      await db.pool.query(
        `INSERT INTO habit_completions (id, habit_id, user_id, date)
         SELECT gen_random_uuid(), $1, $2, d::date
         FROM generate_series('2025-10-10'::date, '2026-11-13'::date, interval '1 day') AS d`,
        [habit.id, user.id],
      ); // 400 consecutive days ending on the 13th

      const last7 = await habitRepo.getCompletionDates(habit.id, user.id, 7);
      expect(last7).toEqual([
        '2026-11-07',
        '2026-11-08',
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
      ]);

      // Streaks use the whole history: 400 days is longer than the old 365-row default
      const streaks = new CalculateHabitStreaksUseCase(habitRepo, LATE_EVENING_UTC);
      const ist = await streaks.execute({ habitId: habit.id, userId: user.id, timezone: IST });
      expect(ist).toEqual({ currentStreak: 400, longestStreak: 400, totalCompletions: 400 });
      const utc = await streaks.execute({ habitId: habit.id, userId: user.id });
      expect(utc.currentStreak).toBe(399); // the 13th has not happened yet in UTC
    });

    it('list shows the IST user a pending "today" while the UTC user still sees the 12th as done', async () => {
      const habit = await new CreateHabitUseCase(habitRepo, LATE_EVENING_UTC).execute({
        userId: user.id,
        title: 'Read',
      });
      await db.pool.query(
        `INSERT INTO habit_completions (id, habit_id, user_id, date) VALUES ($1, $2, $3, '2026-11-12')`,
        [randomUUID(), habit.id, user.id],
      );
      const list = new ListHabitsUseCase(habitRepo, LATE_EVENING_UTC);
      const pick = (views: Awaited<ReturnType<typeof list.execute>>) => views.find((v) => v.id === habit.id)!;

      expect(pick(await list.execute({ userId: user.id, timezone: IST })).isCompletedToday).toBe(false);
      expect(pick(await list.execute({ userId: user.id })).isCompletedToday).toBe(true);
    });

    it('the first completion after IST midnight extends the streak and is "today" for that user', async () => {
      const habit = await new CreateHabitUseCase(habitRepo, LATE_EVENING_UTC).execute({
        userId: user.id,
        title: 'Stretch',
      });
      for (const date of ['2026-11-11', '2026-11-12']) {
        await db.pool.query(
          `INSERT INTO habit_completions (id, habit_id, user_id, date) VALUES ($1, $2, $3, $4)`,
          [randomUUID(), habit.id, user.id, date],
        );
      }
      const complete = await new SetHabitCompletionUseCase(habitRepo, LATE_EVENING_UTC).execute({
        habitId: habit.id,
        userId: user.id,
        date: '2026-11-13',
        completed: true,
        timezone: IST,
      });
      expect(complete.habit.isCompletedToday).toBe(true);
      expect(complete.streaks).toEqual({ currentStreak: 3, longestStreak: 3, totalCompletions: 3 });
      const [row] = await text(`SELECT current_streak, total_completions FROM habits WHERE id = $1`, [
        habit.id,
      ]);
      expect(row).toEqual({ current_streak: 3, total_completions: 3 });
    });
  });

  describe('goals', () => {
    it('records the baseline checkpoint on the user local day and reads checkpoint dates back unshifted', async () => {
      const create = new CreateGoalUseCase(goalRepo, telemetry, LATE_EVENING_UTC);
      const ist = await create.execute({ userId: user.id, type: 'custom', targetValue: 10, timezone: IST });
      const utc = await create.execute({ userId: user.id, type: 'custom', targetValue: 10 });

      const rows = await text(
        `SELECT goal_id, date::text AS date FROM goal_checkpoints WHERE goal_id = ANY($1)`,
        [[ist.id, utc.id]],
      );
      expect(rows.find((r) => r.goal_id === ist.id)!.date).toBe('2026-11-13');
      expect(rows.find((r) => r.goal_id === utc.id)!.date).toBe('2026-11-12');

      const [checkpoint] = await goalRepo.getCheckpoints(ist.id, user.id);
      expect(checkpoint!.date).toBe('2026-11-13');
    });

    it('evaluates overdue against the user local day', async () => {
      const goal = await new CreateGoalUseCase(goalRepo, telemetry, LATE_EVENING_UTC).execute({
        userId: user.id,
        type: 'custom',
        targetValue: 10,
        targetDate: '2026-11-12',
        title: 'Overdue probe',
      });
      const list = new ListGoalsUseCase(goalRepo, telemetry, LATE_EVENING_UTC);
      const find = (views: Awaited<ReturnType<typeof list.execute>>) => views.find((v) => v.id === goal.id)!;

      expect(find(await list.execute({ userId: user.id, timezone: IST })).isOverdue).toBe(true);
      expect(find(await list.execute({ userId: user.id })).isOverdue).toBe(false);
      expect(find(await list.execute({ userId: user.id })).targetDate).toBe('2026-11-12');
    });
  });

  describe('goals telemetry', () => {
    it('buckets workouts into the user local day and counts the IST Monday as a new week', async () => {
      const workoutUser = await seedUser(db.pool, { email: 'workouts@example.com' });
      const insert = (startedAt: string) =>
        db.pool.query(
          `INSERT INTO workout_sessions (user_id, workout_name, started_at, completed_at, is_completed)
           VALUES ($1, 'Session', $2, $2, true)`,
          [workoutUser.id, startedAt],
        );
      await insert('2026-11-12T10:00:00Z'); // 12th in UTC and IST
      await insert('2026-11-12T20:00:00Z'); // 13th 01:30 IST, still the 12th in UTC
      await insert('2026-11-15T18:00:00Z'); // Sunday 23:30 IST
      await insert('2026-11-15T19:00:00Z'); // Monday 00:30 IST, still Sunday in UTC

      // daily streak: two different local days (12th and 13th) for IST, one day for UTC
      expect(await telemetry.getWorkoutStreak(workoutUser.id, '2026-11-13', IST)).toBe(2);
      expect(await telemetry.getWorkoutStreak(workoutUser.id, '2026-11-12', 'UTC')).toBe(1);
      expect(await telemetry.getWorkoutStreak(workoutUser.id, '2026-11-12', 'Not/AZone')).toBe(1);

      // weekly count through a real goal: IST Monday-Sunday vs UTC Monday-Sunday
      const goal = await new CreateGoalUseCase(goalRepo, telemetry, SUNDAY_NIGHT_UTC).execute({
        userId: workoutUser.id,
        type: 'workoutFrequency',
        targetValue: 4,
      });
      const list = new ListGoalsUseCase(goalRepo, telemetry, SUNDAY_NIGHT_UTC);
      const current = async (timezone?: string) =>
        (await list.execute({ userId: workoutUser.id, timezone })).find((g) => g.id === goal.id)!.current;

      expect(await current(IST)).toBe(1); // only the Monday 00:30 IST session is in the new week
      expect(await current()).toBe(4); // UTC week 9th-15th holds all four sessions
    });

    it('anchors "recent days" on the reference date instead of the database session date', async () => {
      const waterUser = await seedUser(db.pool, { email: 'water-recent@example.com' });
      for (let day = 5; day <= 13; day++) {
        await db.pool.query(`INSERT INTO water_intake (user_id, date, amount_ml) VALUES ($1, $2, $3)`, [
          waterUser.id,
          `2026-11-${String(day).padStart(2, '0')}`,
          day * 100,
        ]);
      }
      // rows with date >= reference - 7 days, ascending. Nothing bounds the top, so a client whose "today" is
      // ahead of the reference (no timezone sent) still sees its own newest day: 13th -> 6..13, 12th -> 5..13.
      expect(await telemetry.getRecentDailyWaterLiters(waterUser.id, 7, '2026-11-13')).toEqual([
        0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3,
      ]);
      expect(await telemetry.getRecentDailyWaterLiters(waterUser.id, 7, '2026-11-12')).toEqual([
        0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3,
      ]);
    });
  });

  describe('nutrition', () => {
    const adHoc = { foodName: 'Toast', servingMultiplier: 1, loggedWeightG: 40, calories: 100, proteinG: 4 };

    it('files undated water under the user local day and reads DATE columns back unshifted', async () => {
      const water = new LogWaterUseCase(waterRepo, LATE_EVENING_UTC);
      const ist = await water.execute({ userId: user.id, amountMl: 250, timezone: IST });
      const utc = await water.execute({ userId: user.id, amountMl: 300 });
      expect(ist.entry.date).toBe('2026-11-13');
      expect(utc.entry.date).toBe('2026-11-12');

      const rows = await text(`SELECT id, date::text AS date FROM water_intake WHERE id = ANY($1)`, [
        [ist.entry.id, utc.entry.id],
      ]);
      expect(rows.find((r) => r.id === ist.entry.id)!.date).toBe('2026-11-13');
      expect((await waterRepo.findById(ist.entry.id))!.date).toBe('2026-11-13');
      expect(await waterRepo.getTotalDateRange(user.id, '2026-11-12', '2026-11-13')).toEqual([
        { date: '2026-11-12', totalMl: 300 },
        { date: '2026-11-13', totalMl: 250 },
      ]);
    });

    it('logs, reads and aggregates meals by the user local day, and the weekly window ends on that day', async () => {
      const mealUser = await seedUser(db.pool, { email: 'meals-tz@example.com' });
      const logMeal = new LogMealUseCase(mealRepo, foodRepo, uow, LATE_EVENING_UTC);
      const istMeal = await logMeal.execute({
        userId: mealUser.id,
        mealType: 'breakfast',
        items: [adHoc],
        timezone: IST,
      });
      expect(istMeal.meal.date).toBe('2026-11-13');
      expect((await mealRepo.findById(istMeal.meal.id))!.date).toBe('2026-11-13');

      const daily = new GetDailyNutritionUseCase(mealRepo, waterRepo, targetPort, LATE_EVENING_UTC);
      expect((await daily.execute({ userId: mealUser.id, timezone: IST })).consumed.calories).toBe(100);
      expect((await daily.execute({ userId: mealUser.id })).consumed.calories).toBe(0); // the 12th: nothing logged

      const analytics = new GetNutritionAnalyticsUseCase(mealRepo, targetPort, LATE_EVENING_UTC);
      const ist = await analytics.execute({ userId: mealUser.id, range: 'week', timezone: IST });
      expect([ist.startDate, ist.endDate, ist.loggedDaysCount]).toEqual(['2026-11-07', '2026-11-13', 1]);
      expect(ist.avgCalories).toBe(100);

      // the meal is on the 13th: outside a window that ends on the UTC 12th
      const utc = await analytics.execute({ userId: mealUser.id, range: 'week' });
      expect([utc.startDate, utc.endDate, utc.loggedDaysCount]).toEqual(['2026-11-06', '2026-11-12', 0]);

      // an explicit endDate is used as given
      const explicit = await analytics.execute({ userId: mealUser.id, range: 'week', endDate: '2026-11-13' });
      expect(explicit.loggedDaysCount).toBe(1);
    });
  });
});
