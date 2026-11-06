import { randomUUID } from 'node:crypto';
import { loadDatabaseConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { Database } from '../src/database/transaction.js';
import { PgGoalRepository } from '../src/modules/goals/infrastructure/pg-goal-repository.js';
import { PgHabitRepository } from '../src/modules/goals/infrastructure/pg-habit-repository.js';
import { PgGoalsTelemetryAdapter } from '../src/modules/goals/infrastructure/pg-goals-telemetry-adapter.js';
import { CreateGoalUseCase } from '../src/modules/goals/application/use-cases/create-goal.js';
import { ListGoalsUseCase } from '../src/modules/goals/application/use-cases/list-goals.js';
import { GetGoalDetailsUseCase } from '../src/modules/goals/application/use-cases/get-goal-details.js';
import { UpdateGoalUseCase } from '../src/modules/goals/application/use-cases/update-goal.js';
import { DeleteGoalUseCase } from '../src/modules/goals/application/use-cases/delete-goal.js';
import { LogGoalCheckpointUseCase } from '../src/modules/goals/application/use-cases/goal-checkpoints.js';
import { CreateHabitUseCase } from '../src/modules/goals/application/use-cases/create-habit.js';
import { ListHabitsUseCase } from '../src/modules/goals/application/use-cases/list-habits.js';
import { UpdateHabitUseCase } from '../src/modules/goals/application/use-cases/update-habit.js';
import { DeleteHabitUseCase } from '../src/modules/goals/application/use-cases/delete-habit.js';
import { SetHabitCompletionUseCase } from '../src/modules/goals/application/use-cases/set-habit-completion.js';
import { GetHabitHistoryUseCase } from '../src/modules/goals/application/use-cases/get-habit-history.js';

const APPROVED_BRANCH_ID = 'br-fragrant-morning-b35lwkjg';
const PROTECTED_PRODUCTION_BRANCH_ID = 'br-icy-term-b3lb70tb';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, durationMs: duration });
    console.log(`  ✓ ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Date.now() - start;
    results.push({ name, passed: false, error: err?.message || String(err), durationMs: duration });
    console.error(`  ✗ ${name} (${duration}ms):`, err?.message || err);
  }
}

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main() {
  console.log('=== FitOnus Phase 6: Real PostgreSQL Neon Integration Tests ===\n');

  const pool = createPool(loadDatabaseConfig());
  const db = new Database(pool);

  // Re-verify branch identity
  const branchRes = await pool.query("SELECT setting FROM pg_settings WHERE name = 'neon.branch_id'");
  const currentBranch = branchRes.rows[0]?.setting;
  console.log(`Connected branch: ${currentBranch}`);

  if (currentBranch === PROTECTED_PRODUCTION_BRANCH_ID) {
    throw new Error(`FATAL: Connected to PROTECTED PRODUCTION BRANCH ${currentBranch}! ABORTING.`);
  }

  if (currentBranch !== APPROVED_BRANCH_ID) {
    throw new Error(`FATAL: Branch ${currentBranch} does not match APPROVED DEVELOPMENT BRANCH ${APPROVED_BRANCH_ID}! ABORTING.`);
  }

  const goalRepo = new PgGoalRepository(db);
  const habitRepo = new PgHabitRepository(db);
  const telemetryAdapter = new PgGoalsTelemetryAdapter(db);

  // Use cases
  const createGoal = new CreateGoalUseCase(goalRepo);
  const listGoals = new ListGoalsUseCase(goalRepo, telemetryAdapter);
  const getGoalDetails = new GetGoalDetailsUseCase(goalRepo);
  const updateGoal = new UpdateGoalUseCase(goalRepo);
  const deleteGoal = new DeleteGoalUseCase(goalRepo);
  const logCheckpoint = new LogGoalCheckpointUseCase(goalRepo);

  const createHabit = new CreateHabitUseCase(habitRepo);
  const listHabits = new ListHabitsUseCase(habitRepo);
  const updateHabit = new UpdateHabitUseCase(habitRepo);
  const deleteHabit = new DeleteHabitUseCase(habitRepo);
  const setHabitCompletion = new SetHabitCompletionUseCase(habitRepo);
  const getHabitHistory = new GetHabitHistoryUseCase(habitRepo);

  // Generate isolated test users
  const user1Id = randomUUID();
  const user2Id = randomUUID();
  const user1Email = `goals.test1.${Date.now()}@example.com`;
  const user2Email = `goals.test2.${Date.now()}@example.com`;

  try {
    console.log('-> Creating isolated test users on Neon development database...');
    await pool.query(`
      INSERT INTO users (id, email, display_name, password_hash, role) VALUES
      ($1, $2, 'Goals Tester 1', 'dummyhash', 'member'),
      ($3, $4, 'Goals Tester 2', 'dummyhash', 'member');
    `, [user1Id, user1Email, user2Id, user2Email]);

    console.log(`✓ Test users created: User 1 (${user1Id}), User 2 (${user2Id})\n`);

    // --- SUITE 1: Goals CRUD & Calculations ---
    console.log('--- SUITE 1: Goals Real PostgreSQL CRUD & Progress ---');
    let createdGoalId = '';

    await test('Goal Creation (User 1, weightLoss 90 -> 80kg)', async () => {
      const goal = await createGoal.execute({
        userId: user1Id,
        type: 'weightLoss',
        title: 'Reach 80kg Goal',
        metricUnit: 'kg',
        startValue: 90.0,
        targetValue: 80.0,
        cadence: 'once',
        direction: 'decrease',
        deadlineLabel: 'Dec 31, 2026',
        targetDate: '2026-12-31',
        isPrimary: true,
      });

      assert(goal.id, 'Goal must have UUID');
      assert(goal.userId === user1Id, 'Goal must belong to user 1');
      assert(goal.start === 90, 'Start value must match');
      assert(goal.current === 90, 'Current value defaults to start');
      assert(goal.target === 80, 'Target value must match');
      assert(goal.progress === 0.0, 'Initial progress must be 0%');
      assert(goal.isPrimary === true, 'isPrimary must be true');
      createdGoalId = goal.id;
    });

    await test('Goal Details & Checkpoints Retrieval', async () => {
      const details = await getGoalDetails.execute({ id: createdGoalId, userId: user1Id });
      assert(details, 'Goal details must exist');
      assert(details.goal.id === createdGoalId, 'Goal ID must match');
      assert(Array.isArray(details.checkpoints), 'Checkpoints must be an array');
      // Upon creation, 1 baseline checkpoint is recorded
      assert(details.checkpoints.length >= 1, 'Baseline checkpoint recorded');
      assert(details.checkpoints[0]?.value === 90, 'Baseline value matches start');
    });

    await test('Authenticated User Isolation: User 2 cannot read User 1 goal details', async () => {
      let threw = false;
      try {
        await getGoalDetails.execute({ id: createdGoalId, userId: user2Id });
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('NOT_FOUND') || err.message.includes('not found'), 'Must throw not found');
      }
      assert(threw, 'User 2 must be blocked from reading User 1 goal');
    });

    await test('Goal Checkpoint Logging & Deterministic Progress Update', async () => {
      const checkpoint = await logCheckpoint.execute({
        goalId: createdGoalId,
        userId: user1Id,
        value: 85.0,
        notes: 'Midway check-in',
      });

      assert(checkpoint.value === 85.0, 'Checkpoint value returned');

      // Verify updated goal progress via getGoalDetails
      const details = await getGoalDetails.execute({ id: createdGoalId, userId: user1Id });
      assert(details.goal.current === 85.0, 'Goal current value updated to 85');
      // 90 -> 80 is 10kg decrease. At 85kg, completed 5kg = 50%
      assert(details.goal.progress === 0.5, 'Expected 50% progress for 85kg');

      // Query raw database to verify persistence in goal_checkpoints
      const checkRes = await pool.query(`
        SELECT value, notes, date 
        FROM goal_checkpoints 
        WHERE goal_id = $1 AND notes = 'Midway check-in'
      `, [createdGoalId]);
      assert(checkRes.rows.length === 1, 'Checkpoint row must exist in DB');
      assert(Number(checkRes.rows[0].value) === 85.0, 'Checkpoint value stored accurately');
      assert(checkRes.rows[0].notes === 'Midway check-in', 'Checkpoint notes stored');
    });

    await test('Authenticated User Isolation: User 2 cannot log checkpoint on User 1 goal', async () => {
      let threw = false;
      try {
        await logCheckpoint.execute({
          goalId: createdGoalId,
          userId: user2Id,
          value: 70.0,
        });
      } catch (err: any) {
        threw = true;
      }
      assert(threw, 'User 2 must not be able to log checkpoint on User 1 goal');
    });

    await test('Goal Update (target value adjustment to 78kg)', async () => {
      const updated = await updateGoal.execute({
        id: createdGoalId,
        userId: user1Id,
        targetValue: 78.0,
        description: 'Pushed target further',
      });

      assert(updated.target === 78.0, 'Target value updated');
      assert(updated.description === 'Pushed target further', 'Description updated');
    });

    await test('List Goals with User Isolation', async () => {
      const user1Goals = await listGoals.execute({ userId: user1Id });
      const user2Goals = await listGoals.execute({ userId: user2Id });

      assert(user1Goals.length === 1, 'User 1 must see 1 goal');
      assert(user1Goals[0]?.id === createdGoalId, 'User 1 goal matches');
      assert(user2Goals.length === 0, 'User 2 must see 0 goals');
    });

    await test('Goal Soft Deletion and Exclusion from Active List', async () => {
      await deleteGoal.execute({ id: createdGoalId, userId: user1Id });

      const user1Goals = await listGoals.execute({ userId: user1Id });
      assert(user1Goals.length === 0, 'Active list must exclude soft-deleted goal');

      // Verify row still exists with deleted_at set in DB
      const dbRow = await pool.query('SELECT status, deleted_at FROM goals WHERE id = $1', [createdGoalId]);
      assert(dbRow.rows.length === 1, 'Row exists in DB');
      assert(dbRow.rows[0].deleted_at !== null, 'deleted_at is populated');
    });

    // --- SUITE 2: Habits CRUD & Streaks ---
    console.log('\n--- SUITE 2: Habits Real PostgreSQL CRUD, Completions & Streaks ---');
    let createdHabitId = '';

    await test('Habit Creation (User 1, Daily Hydration 7 days/week)', async () => {
      const habit = await createHabit.execute({
        userId: user1Id,
        title: 'Daily 3L Hydration',
        description: 'Drink 3L of water every day',
        category: 'nutrition',
        frequency: 'daily',
        targetDaysPerWeek: 7,
        icon: 'water',
        color: 'blue',
      });

      assert(habit.id, 'Habit must have UUID');
      assert(habit.userId === user1Id, 'Habit belongs to User 1');
      assert(habit.category === 'nutrition', 'Category matches');
      assert(habit.frequency === 'daily', 'Frequency is daily');
      assert(habit.targetDaysPerWeek === 7, 'Target days matches');
      assert(habit.currentStreak === 0, 'Initial currentStreak is 0');
      assert(habit.longestStreak === 0, 'Initial longestStreak is 0');
      assert(habit.totalCompletions === 0, 'Initial totalCompletions is 0');
      createdHabitId = habit.id;
    });

    await test('Habit Completion Idempotency (ON CONFLICT DO NOTHING)', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const idempotencyKey = randomUUID();

      // Step 1: Complete today
      const res1 = await setHabitCompletion.execute({
        habitId: createdHabitId,
        userId: user1Id,
        date: today,
        completed: true,
        id: idempotencyKey,
      });

      assert(res1.habit.isCompletedToday === true, 'Habit marked completed today');
      assert(res1.habit.currentStreak === 1, 'Current streak is 1');
      assert(res1.habit.totalCompletions === 1, 'Total completions is 1');

      // Step 2: Redundant complete today (same idempotency / duplicate submission)
      const res2 = await setHabitCompletion.execute({
        habitId: createdHabitId,
        userId: user1Id,
        date: today,
        completed: true,
        id: idempotencyKey,
      });

      assert(res2.habit.currentStreak === 1, 'Current streak remains 1 on duplicate');
      assert(res2.habit.totalCompletions === 1, 'Total completions remains 1 on duplicate');

      // Verify in DB only 1 record exists
      const dbCompletions = await pool.query('SELECT count(*) FROM habit_completions WHERE habit_id = $1', [createdHabitId]);
      assert(Number(dbCompletions.rows[0].count) === 1, 'Only 1 DB completion record exists');
    });

    await test('Habit Unmarking / Explicit Toggle to False', async () => {
      const today = new Date().toISOString().slice(0, 10);

      const res = await setHabitCompletion.execute({
        habitId: createdHabitId,
        userId: user1Id,
        date: today,
        completed: false,
      });

      assert(res.habit.isCompletedToday === false, 'Habit unmarked');
      assert(res.habit.currentStreak === 0, 'Streak reset to 0');
      assert(res.habit.totalCompletions === 0, 'Total completions reset to 0');

      // Verify row removed from DB
      const dbCompletions = await pool.query('SELECT count(*) FROM habit_completions WHERE habit_id = $1', [createdHabitId]);
      assert(Number(dbCompletions.rows[0].count) === 0, 'Completion record deleted from DB');
    });

    await test('Multi-Day Deterministic Streak Calculation on Real Database', async () => {
      // Seed 4 consecutive historical days of completions
      const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
      for (const d of dates) {
        await pool.query(
          'INSERT INTO habit_completions (id, habit_id, user_id, date) VALUES ($1, $2, $3, $4)',
          [randomUUID(), createdHabitId, user1Id, d]
        );
      }

      // Re-trigger completion calculation
      const res = await setHabitCompletion.execute({
        habitId: createdHabitId,
        userId: user1Id,
        date: '2026-11-06',
        completed: true,
      });

      assert(res.habit.currentStreak >= 4, `Expected streak >= 4, got ${res.habit.currentStreak}`);
      assert(res.habit.longestStreak >= 4, `Expected longest streak >= 4, got ${res.habit.longestStreak}`);
      assert(res.habit.totalCompletions === 4, `Expected total completions 4, got ${res.habit.totalCompletions}`);
    });

    await test('Habit History Query & User Isolation', async () => {
      const history = await getHabitHistory.execute({
        habitId: createdHabitId,
        userId: user1Id,
      });

      assert(history.habit.id === createdHabitId, 'Habit ID matches');
      assert(history.completionDates.length === 4, `Expected 4 completion dates, got ${history.completionDates.length}`);

      // User 2 cannot access User 1 habit history
      let user2Blocked = false;
      try {
        await getHabitHistory.execute({
          habitId: createdHabitId,
          userId: user2Id,
        });
      } catch {
        user2Blocked = true;
      }
      assert(user2Blocked, 'User 2 must be blocked from reading User 1 habit history');
    });

    await test('Habit Update (target days to 5 and title change)', async () => {
      const updated = await updateHabit.execute({
        id: createdHabitId,
        userId: user1Id,
        title: 'Hydration Routine (Workdays)',
        targetDaysPerWeek: 5,
      });

      assert(updated.title === 'Hydration Routine (Workdays)', 'Title updated');
      assert(updated.targetDaysPerWeek === 5, 'Target days updated');
    });

    await test('List Habits with User Isolation', async () => {
      const user1Habits = await listHabits.execute({ userId: user1Id });
      const user2Habits = await listHabits.execute({ userId: user2Id });

      assert(user1Habits.length === 1, 'User 1 sees 1 habit');
      assert(user1Habits[0]?.id === createdHabitId, 'Habit ID matches');
      assert(user2Habits.length === 0, 'User 2 sees 0 habits');
    });

    await test('Habit Soft Deletion and Exclusion from Active List', async () => {
      await deleteHabit.execute({ id: createdHabitId, userId: user1Id });

      const user1Habits = await listHabits.execute({ userId: user1Id });
      assert(user1Habits.length === 0, 'Active list excludes soft-deleted habit');

      const dbRow = await pool.query('SELECT is_archived, deleted_at FROM habits WHERE id = $1', [createdHabitId]);
      assert(dbRow.rows.length === 1, 'Row exists in DB');
      assert(dbRow.rows[0].deleted_at !== null, 'deleted_at is populated');
    });

    // --- SUITE 3: Telemetry Adapter on Neon ---
    console.log('\n--- SUITE 3: Telemetry Adapter on Real PostgreSQL ---');
    await test('Read-only Telemetry Queries safely execute without errors', async () => {
      const weight = await telemetryAdapter.getLatestWeight(user1Id);
      assert(weight === null, 'Weight should be null when no logs exist');

      const water = await telemetryAdapter.getDailyWaterIntakeLiters(user1Id, '2026-11-06');
      assert(water === 0, 'Water should be 0 when no intake logged');

      const nutrition = await telemetryAdapter.getDailyNutrition(user1Id, '2026-11-06');
      assert(nutrition.calories === 0 && nutrition.proteinG === 0, 'Nutrition should be 0');

      const workouts = await telemetryAdapter.getWeeklyWorkoutCount(user1Id, new Date('2026-11-01'), new Date('2026-11-07'));
      assert(workouts === 0, 'Workouts should be 0 when no sessions logged');

      const streak = await telemetryAdapter.getWorkoutStreak(user1Id);
      assert(streak === 0, 'Workout streak should be 0');
    });

  } finally {
    // --- SAFE CLEANUP ---
    console.log('\n-> Cleaning up isolated test users (Cascades to test records)...');
    try {
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [user1Id, user2Id]);
      console.log('✓ Test users deleted.');

      const verifyClean = await pool.query(`
        SELECT 
          (SELECT count(*) FROM goals WHERE user_id IN ($1, $2)) AS goals,
          (SELECT count(*) FROM habits WHERE user_id IN ($1, $2)) AS habits,
          (SELECT count(*) FROM goal_checkpoints WHERE user_id IN ($1, $2)) AS checkpoints,
          (SELECT count(*) FROM habit_completions WHERE user_id IN ($1, $2)) AS completions;
      `, [user1Id, user2Id]);

      const counts = verifyClean.rows[0];
      console.log(`Cascade cleanup verification: ${JSON.stringify(counts)}`);
      assert(Number(counts.goals) === 0 && Number(counts.habits) === 0, 'All test records cleanly purged');
    } catch (cleanupErr: any) {
      console.error('Error during cleanup:', cleanupErr?.message);
    }

    await pool.end();
  }

  // --- REPORT SUMMARY ---
  console.log('\n===============================================================');
  console.log('         REAL POSTGRESQL INTEGRATION TEST RESULTS              ');
  console.log('===============================================================');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.error('FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => console.error(` - ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('✓ ALL REAL POSTGRESQL INTEGRATION TESTS PASSED (100%)');
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
