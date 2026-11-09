import assert from 'node:assert/strict';
import request from 'supertest';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { createLogger } from '../src/shared/logging/logger.js';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';

async function main() {
  console.log('=================================================================');
  console.log('FitOnus Phase 11.3: Real Data Flow Verification (Neon Dev DB)');
  console.log('Workout -> Nutrition -> Water -> Dashboard Synchronization');
  console.log('=================================================================\n');

  const config = loadConfig();
  const logger = createLogger({ level: 'silent', pretty: false });
  const pool = createPool({
    ...config.database,
    connectionTimeoutMs: 15000,
  });

  let testUserId = '';

  try {
    // 1. Neon Branch Safety Verification
    console.log('--- Step 0: Database Safety & Branch Verification ---');
    const branchRes = await pool.query<{ setting: string }>(
      "SELECT setting FROM pg_settings WHERE name = 'neon.branch_id'",
    );
    const currentBranch = branchRes.rows[0]?.setting;
    console.log(`Current Neon branch_id: ${currentBranch}`);

    const APPROVED_DEV_BRANCH = 'br-fragrant-morning-b35lwkjg';
    const PROTECTED_PROD_BRANCH = 'br-icy-term-b3lb70tb';

    if (currentBranch === PROTECTED_PROD_BRANCH) {
      console.error('FATAL: Connected to PROTECTED PRODUCTION BRANCH! Aborting immediately.');
      process.exit(1);
    }
    assert.equal(
      currentBranch,
      APPROVED_DEV_BRANCH,
      `Must be connected to approved development branch: ${APPROVED_DEV_BRANCH}`,
    );
    console.log('✓ Safety Verified: Connected to approved dev branch (br-fragrant-morning-b35lwkjg).\n');

    // 2. Initialize application container
    console.log('--- Step 1: Bootstrapping application container ---');
    const container = createContainer(config, pool);
    const app = createApp({ config, logger, container });

    // 3. Register isolated test user
    const testEmail = `qa_phase11_3_${Date.now()}@fitonus.test`;
    const testPassword = 'Password123!';
    console.log('Registering test user:', testEmail);
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        displayName: 'Phase11 Flow QA',
      });
    assert.equal(regRes.status, 201, `Registration failed: ${JSON.stringify(regRes.body)}`);
    const token = regRes.body.data.accessToken;
    const userRes = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [testEmail]);
    testUserId = userRes.rows[0]!.id;
    console.log(`✓ Test user created: ${testUserId}\n`);

    // 4. Initial Dashboard State Verification
    console.log('--- Step 2: Verifying initial empty dashboard state ---');
    const initialDashRes = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ timezone: 'UTC' });
    assert.equal(initialDashRes.status, 200);
    const initialDash = initialDashRes.body.data;
    assert.equal(initialDash.summary.caloriesBurned, 0, 'Initial calories burned must be 0');
    assert.equal(initialDash.summary.activeMinutes, 0, 'Initial active minutes must be 0');
    assert.equal(initialDash.summary.caloriesConsumed, 0, 'Initial calories consumed must be 0');
    assert.equal(initialDash.summary.waterIntake, 0, 'Initial water intake must be 0');
    assert.equal(initialDash.summary.recoveryScore, null, 'Unconnected wearable metrics must be null');
    assert.equal(initialDash.recentActivity.length, 0, 'Recent activity should be empty initially');
    console.log('✓ Initial dashboard metrics verified truthful (all zeros/nulls).\n');

    // 5. Workout Creation & Persistence
    console.log('--- Step 3: Logging completed workout session ---');
    const clientSessionId = `ws-flow-${Date.now()}`;
    const now = new Date();
    const workoutPayload = {
      workoutName: 'Chest & Core Strength',
      startedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      completedAt: now.toISOString(),
      durationSeconds: 2700, // 45 min
      caloriesBurned: 380,
      caloriesSource: 'estimated',
      sets: [
        {
          exerciseId: 'e0000000-0000-4000-8000-000000000001', // Bench press
          setNumber: 1,
          weightKg: 60,
          reps: 10,
          isWarmup: false,
        },
        {
          exerciseId: 'e0000000-0000-4000-8000-000000000001',
          setNumber: 2,
          weightKg: 70,
          reps: 8,
          isWarmup: false,
        },
      ],
    };

    const sessionRes = await request(app)
      .post('/api/v1/workouts/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', clientSessionId)
      .send(workoutPayload);
    assert.equal(sessionRes.status, 201, `Workout creation failed: ${JSON.stringify(sessionRes.body)}`);
    const savedSessionId = sessionRes.body.data.id;
    console.log(`✓ Workout session persisted in Neon Dev: ${savedSessionId}\n`);

    // 6. Workout History Verification
    console.log('--- Step 4: Verifying workout in user history ---');
    const historyRes = await request(app)
      .get('/api/v1/workouts/sessions')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(historyRes.status, 200);
    const sessions = historyRes.body.data;
    assert.ok(sessions.length >= 1, 'Workout session must appear in history');
    assert.equal(sessions[0].workoutName, 'Chest & Core Strength');
    assert.equal(sessions[0].caloriesBurned, 380);
    console.log('✓ Workout history successfully populated from backend.\n');

    // 7. Dashboard Reflection after Workout
    console.log('--- Step 5: Verifying dashboard updates after workout ---');
    const dashAfterWorkout = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ timezone: 'UTC' });
    assert.equal(dashAfterWorkout.status, 200);
    const dashW = dashAfterWorkout.body.data;
    assert.equal(dashW.summary.caloriesBurned, 380, 'Dashboard calories burned must reflect workout');
    assert.equal(dashW.summary.activeMinutes, 45, 'Dashboard active minutes must reflect workout');
    assert.equal(dashW.progress.dailyGoalProgress, 1, 'Daily goal progress must be 1 on workout completion');
    assert.ok(dashW.recentActivity.length >= 1, 'Recent activity must have workout entry');
    assert.equal(dashW.recentActivity[0].type, 'workout');
    console.log('✓ Dashboard correctly updated from real workout data.\n');

    // 8. Offline Deduplication / Idempotency Test
    console.log('--- Step 6: Verifying idempotency / deduplication ---');
    const replayedSessionRes = await request(app)
      .post('/api/v1/workouts/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', clientSessionId)
      .send(workoutPayload);
    assert.equal(replayedSessionRes.status, 201);
    assert.equal(replayedSessionRes.headers['idempotent-replayed'], 'true', 'Must be flagged as idempotent replay');

    const dashAfterReplay = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ timezone: 'UTC' });
    assert.equal(dashAfterReplay.body.data.summary.caloriesBurned, 380, 'Calories burned must not double');
    console.log('✓ Idempotency protected: Duplicate submission did not duplicate metrics.\n');

    // 9. Meal Logging & Daily Nutrition
    console.log('--- Step 7: Logging meal in Neon Dev ---');
    const todayStr = now.toISOString().slice(0, 10);
    const mealId = 'b0000000-0000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0');
    const mealPayload = {
      id: mealId,
      mealType: 'lunch',
      date: todayStr,
      notes: 'Post-workout fuel',
      items: [
        {
          foodId: 'f0000000-0000-4000-8000-000000000001', // Chicken breast
          foodName: 'Chicken Breast, boneless, skinless, raw',
          servingSize: 1,
          servingUnit: 'serving',
          servingWeightG: 200,
          servingMultiplier: 1.0,
          calories: 330,
          proteinG: 62,
          carbsG: 0,
          fatG: 7,
          fiberG: 0,
        },
      ],
    };

    const mealRes = await request(app)
      .post('/api/v1/nutrition/meals')
      .set('Authorization', `Bearer ${token}`)
      .send(mealPayload);
    assert.equal(mealRes.status, 201, `Meal logging failed: ${JSON.stringify(mealRes.body)}`);
    console.log(`✓ Meal logged successfully in Neon Dev: ${mealRes.body.data.id}\n`);

    // 10. Nutrition Daily & Dashboard Verification
    console.log('--- Step 8: Verifying daily nutrition and dashboard totals ---');
    const dailyNutRes = await request(app)
      .get('/api/v1/nutrition/daily')
      .set('Authorization', `Bearer ${token}`)
      .query({ date: todayStr });
    assert.equal(dailyNutRes.status, 200);
    const dailyNut = dailyNutRes.body.data;
    assert.ok(dailyNut.consumed.calories >= 100, 'Daily calories must reflect meal');
    assert.ok(dailyNut.consumed.proteinG >= 20, 'Daily protein must reflect meal');

    const dashAfterMeal = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ timezone: 'UTC' });
    assert.equal(dashAfterMeal.status, 200);
    const dashM = dashAfterMeal.body.data;
    assert.equal(dashM.summary.caloriesConsumed, Math.round(dailyNut.consumed.calories), 'Dashboard calories consumed must match daily log');
    assert.equal(dashM.nutrition.protein, Math.round(dailyNut.consumed.proteinG), 'Dashboard protein must match daily log');
    console.log('✓ Dashboard nutrition totals match daily logs exactly.\n');

    // 11. Water Logging & Verification
    console.log('--- Step 9: Logging water intake ---');
    const waterId = 'c0000000-0000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0');
    const waterPayload = {
      id: waterId,
      date: todayStr,
      amountMl: 750,
      loggedAt: now.toISOString(),
    };

    const waterRes = await request(app)
      .post('/api/v1/nutrition/water')
      .set('Authorization', `Bearer ${token}`)
      .send(waterPayload);
    assert.equal(waterRes.status, 201, `Water logging failed: ${JSON.stringify(waterRes.body)}`);
    console.log(`✓ Water intake logged in Neon Dev: ${waterPayload.amountMl}ml\n`);

    // 12. Dashboard Water Reflection
    console.log('--- Step 10: Verifying dashboard water totals ---');
    const dashAfterWater = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .query({ timezone: 'UTC' });
    assert.equal(dashAfterWater.status, 200);
    const dashWtr = dashAfterWater.body.data;
    assert.equal(dashWtr.summary.waterIntakeMl, 750, 'Dashboard water intake (ml) must be 750');
    assert.equal(dashWtr.summary.waterIntake, 0.8, 'Dashboard water intake (L) must round to 0.8L');
    console.log('✓ Dashboard water totals verified accurately.\n');

    // 13. Clean up test records
    console.log('--- Step 11: Cleanup test records ---');
    await pool.query('DELETE FROM workout_sessions WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM meals WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM water_intake WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);

    const verifyCleanup = await pool.query('SELECT id FROM users WHERE id = $1', [testUserId]);
    assert.equal(verifyCleanup.rows.length, 0, 'Test user must be completely deleted');
    console.log('✓ All test records and test user cleaned up cleanly from Neon Dev!\n');

    console.log('=================================================================');
    console.log('PHASE 11.3 REAL DATA FLOW VERIFICATION: ALL 11 STEPS PASSED!');
    console.log('=================================================================');
  } finally {
    if (testUserId) {
      try {
        await pool.query('DELETE FROM workout_sessions WHERE user_id = $1', [testUserId]);
        await pool.query('DELETE FROM meals WHERE user_id = $1', [testUserId]);
        await pool.query('DELETE FROM water_intake WHERE user_id = $1', [testUserId]);
        await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
      } catch {
        // Ignored
      }
    }
    await pool.end();
  }
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
