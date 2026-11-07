/**
 * FitOnus Phase 8.6 — Advanced Analytics E2E & Performance Benchmark
 *
 * Runs end-to-end verification against the live Neon Development Database
 * (br-fragrant-morning-b35lwkjg), testing all seven endpoints, Clean Architecture
 * container, Zod validation, user isolation, calculation engine, and latency.
 */

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createContainer } from '../src/container.js';
import { createPool } from '../src/database/pool.js';
import { createLogger } from '../src/shared/logging/logger.js';
import request from 'supertest';
import assert from 'node:assert/strict';

export interface LatencyMetric {
  endpoint: string;
  minMs: number;
  maxMs: number;
  avgMs: number;
  samples: number[];
}

async function main() {
  console.log('=================================================================');
  console.log('FitOnus Phase 8.6: Advanced Analytics E2E & Performance Verification');
  console.log('=================================================================\n');

  const config = loadConfig();
  const logger = createLogger({ level: 'silent', pretty: false });
  const pool = createPool(config.database);

  // 1. Safety Check: Verify Neon Database Branch
  console.log('--- Step 0: Database Safety & Branch Verification ---');
  const branchRes = await pool.query<{ setting: string }>(
    "SELECT setting FROM pg_settings WHERE name = 'neon.branch_id'"
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
    `Must be connected to approved development branch: ${APPROVED_DEV_BRANCH}`
  );
  console.log('✓ Safety Verified: Connected to approved dev branch (br-fragrant-morning-b35lwkjg).\n');

  // 2. Initialize application with full container
  const container = createContainer(config, pool);
  const app = createApp({ config, logger, container });

  const testSuffix = Date.now().toString().slice(-6);
  const userAEmail = `qa_analytics_a_${testSuffix}@fitonus.test`;
  const userBEmail = `qa_analytics_b_${testSuffix}@fitonus.test`;
  const password = 'Password123!';

  let userAToken = '';
  let userAId = '';
  let userBToken = '';
  let userBId = '';

  const latencies: LatencyMetric[] = [];

  const measureRequest = async (
    name: string,
    fn: () => Promise<request.Response>,
    iterations = 3
  ): Promise<request.Response> => {
    let lastRes!: request.Response;
    const samples: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      lastRes = await fn();
      const duration = performance.now() - start;
      samples.push(duration);
    }

    const minMs = Math.round(Math.min(...samples) * 100) / 100;
    const maxMs = Math.round(Math.max(...samples) * 100) / 100;
    const avgMs = Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 100) / 100;

    latencies.push({ endpoint: name, minMs, maxMs, avgMs, samples });
    return lastRes;
  };

  try {
    // 3. User Registration & Auth
    console.log('--- Step 1: User Registration & Authentication Setup ---');
    const decodeUserId = (token: string) =>
      JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString()).sub;

    const regARes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: userAEmail, password, displayName: 'QA Analytics User A' });
    assert.equal(regARes.status, 201, `Failed to register User A: ${JSON.stringify(regARes.body)}`);
    userAToken = regARes.body.data.accessToken;
    userAId = decodeUserId(userAToken);

    const regBRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: userBEmail, password, displayName: 'QA Analytics User B' });
    assert.equal(regBRes.status, 201, `Failed to register User B: ${JSON.stringify(regBRes.body)}`);
    userBToken = regBRes.body.data.accessToken;
    userBId = decodeUserId(userBToken);

    console.log(`✓ User A created: ${userAId}`);
    console.log(`✓ User B created: ${userBId} (Fresh user with 0 records)\n`);

    // 4. Test Case 1: Fresh User (User B) with 0 records across all 7 endpoints
    console.log('--- Step 2: Fresh User Empty State Verification (User B) ---');

    // 2.1 Overview
    const emptyOverviewRes = await request(app)
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(emptyOverviewRes.status, 200);
    assert.equal(emptyOverviewRes.body.success, true);
    assert.equal(emptyOverviewRes.body.data.workoutSummary.completedSessions, 0);
    assert.equal(emptyOverviewRes.body.data.workoutSummary.totalVolumeKg, 0);
    assert.equal(emptyOverviewRes.body.data.nutritionSummary.avgCalories, 0);
    assert.equal(emptyOverviewRes.body.data.hydrationSummary.avgWaterMl, 0);
    assert.equal(emptyOverviewRes.body.data.bodySummary.currentWeightKg, null);
    assert.ok(Array.isArray(emptyOverviewRes.body.data.comparisonVsPriorPeriod));
    console.log('✓ 1. /analytics/overview empty state verified');

    // 2.2 Workouts
    const emptyWorkoutsRes = await request(app)
      .get('/api/v1/analytics/workouts?range=30d')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(emptyWorkoutsRes.status, 200);
    assert.equal(emptyWorkoutsRes.body.data.totalSessions, 0);
    assert.equal(emptyWorkoutsRes.body.data.totalVolumeKg, 0);
    assert.ok(Array.isArray(emptyWorkoutsRes.body.data.frequencySeries));
    assert.ok(Array.isArray(emptyWorkoutsRes.body.data.volumeSeries));
    console.log('✓ 2. /analytics/workouts empty state verified');

    // 2.3 Exercise Progression
    const emptyProgressionRes = await request(app)
      .get('/api/v1/analytics/workouts/exercises/00000000-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(emptyProgressionRes.status, 200);
    assert.equal(emptyProgressionRes.body.data.currentPr, null);
    assert.equal(emptyProgressionRes.body.data.progression.length, 0);
    console.log('✓ 3. /analytics/workouts/exercises/:id empty state verified');

    // 2.4 Nutrition
    const emptyNutritionRes = await request(app)
      .get('/api/v1/analytics/nutrition?range=7d')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(emptyNutritionRes.status, 200);
    assert.equal(emptyNutritionRes.body.data.avgCalories, 0);
    assert.equal(emptyNutritionRes.body.data.macroSplit.length, 3);
    assert.equal(emptyNutritionRes.body.data.macroSplit[0].grams, 0);
    assert.ok(Array.isArray(emptyNutritionRes.body.data.dailyTrends));
    console.log('✓ 4. /analytics/nutrition empty state verified');

    // 2.5 Hydration
    const emptyHydrationRes = await request(app)
      .get('/api/v1/analytics/hydration?range=7d')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(emptyHydrationRes.status, 200);
    assert.equal(emptyHydrationRes.body.data.avgWaterMl, 0);
    assert.ok(Array.isArray(emptyHydrationRes.body.data.points));
    console.log('✓ 5. /analytics/hydration empty state verified');

    // 2.6 Body
    const emptyBodyRes = await request(app)
      .get('/api/v1/analytics/body?range=30d')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(emptyBodyRes.status, 200);
    assert.equal(emptyBodyRes.body.data.startingWeightKg, null);
    assert.equal(emptyBodyRes.body.data.currentWeightKg, null);
    assert.equal(emptyBodyRes.body.data.weeklyVelocityKg, 0);
    assert.equal(emptyBodyRes.body.data.weightTrend.length, 0);
    console.log('✓ 6. /analytics/body empty state verified');

    // 2.7 Goals & Habits
    const emptyGoalsRes = await request(app)
      .get('/api/v1/analytics/goals-habits?windowDays=30')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(emptyGoalsRes.status, 200);
    assert.equal(emptyGoalsRes.body.data.goalStats.totalGoals, 0);
    assert.equal(emptyGoalsRes.body.data.habitsSummary.length, 0);
    assert.ok(Array.isArray(emptyGoalsRes.body.data.consistencyHeatmap));
    console.log('✓ 7. /analytics/goals-habits empty state verified\n');

    // 5. Seed Real Records for User A
    console.log('--- Step 3: Seeding Real Database Records for User A ---');

    // 5.1 Profile
    await pool.query(
      `INSERT INTO user_profiles (
         user_id, height_cm, current_weight_kg, starting_weight_kg, target_weight_kg,
         primary_goal, daily_calorie_target, daily_protein_grams, workout_days_per_week
       ) VALUES ($1, 182, 81.2, 85.0, 78.0, 'lose', 2200, 160, 4)
       ON CONFLICT (user_id) DO UPDATE SET
         current_weight_kg = 81.2, starting_weight_kg = 85.0, target_weight_kg = 78.0,
         daily_calorie_target = 2200, daily_protein_grams = 160, workout_days_per_week = 4`,
      [userAId]
    );

    // 5.2 Exercise & Workouts
    const exRes = await pool.query<{ id: string }>(
      `SELECT id FROM exercises LIMIT 1`
    );
    let exerciseId = exRes.rows[0]?.id;
    if (!exerciseId) {
      const newEx = await pool.query<{ id: string }>(
        `INSERT INTO exercises (name, muscle_group, category)
         VALUES ('QA Bench Press', 'chest', 'barbell') RETURNING id`
      );
      exerciseId = newEx.rows[0]!.id;
    }

    const now = new Date();
    const d1 = new Date(now.getTime() - 10 * 86400000);
    const d2 = new Date(now.getTime() - 5 * 86400000);
    const d3 = new Date(now.getTime() - 1 * 86400000);

    // 3 Completed Workout Sessions
    const s1 = await pool.query<{ id: string }>(
      `INSERT INTO workout_sessions (
         user_id, workout_name, started_at, completed_at, duration_seconds,
         total_volume_kg, total_sets, total_reps, is_completed
       ) VALUES ($1, 'Push Day A', $2::timestamptz, $2::timestamptz + interval '45 minutes', 2700, 10000, 10, 50, true)
       RETURNING id`,
      [userAId, d1]
    );
    const s2 = await pool.query<{ id: string }>(
      `INSERT INTO workout_sessions (
         user_id, workout_name, started_at, completed_at, duration_seconds,
         total_volume_kg, total_sets, total_reps, is_completed
       ) VALUES ($1, 'Push Day B', $2::timestamptz, $2::timestamptz + interval '50 minutes', 3000, 11000, 10, 50, true)
       RETURNING id`,
      [userAId, d2]
    );
    const s3 = await pool.query<{ id: string }>(
      `INSERT INTO workout_sessions (
         user_id, workout_name, started_at, completed_at, duration_seconds,
         total_volume_kg, total_sets, total_reps, is_completed
       ) VALUES ($1, 'Push Day C', $2::timestamptz, $2::timestamptz + interval '55 minutes', 3300, 12500, 10, 50, true)
       RETURNING id`,
      [userAId, d3]
    );

    // Sets for Exercise Progression
    await pool.query(
      `INSERT INTO workout_session_sets (session_id, exercise_id, set_number, weight_kg, reps, is_warmup, is_pr)
       VALUES
         ($1, $4, 1, 80.0, 5, false, false),
         ($2, $4, 1, 90.0, 5, false, false),
         ($3, $4, 1, 100.0, 5, false, true)`,
      [s1.rows[0]!.id, s2.rows[0]!.id, s3.rows[0]!.id, exerciseId]
    );

    // Personal Record
    await pool.query(
      `INSERT INTO personal_records (user_id, exercise_id, record_type, weight_kg, reps, volume_kg, estimated_1rm_kg, session_id, achieved_at)
       VALUES ($1, $2, 'estimated_1rm', 100.0, 5, 500.0, 116.7, $3, $4)`,
      [userAId, exerciseId, s3.rows[0]!.id, d3]
    );

    // 5.3 Meals & Nutrition
    const dateStr1 = d1.toISOString().slice(0, 10);
    const dateStr2 = d2.toISOString().slice(0, 10);
    const dateStr3 = d3.toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO meals (user_id, meal_type, date, total_calories, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g)
       VALUES
         ($1, 'breakfast', $2, 600, 45, 60, 20, 5),
         ($1, 'lunch', $2, 800, 60, 80, 25, 8),
         ($1, 'dinner', $2, 800, 55, 75, 25, 7),
         ($1, 'breakfast', $3, 700, 50, 70, 22, 6),
         ($1, 'lunch', $3, 900, 65, 90, 28, 9),
         ($1, 'dinner', $3, 700, 55, 70, 22, 6),
         ($1, 'breakfast', $4, 650, 48, 65, 21, 5),
         ($1, 'lunch', $4, 850, 62, 85, 26, 8),
         ($1, 'dinner', $4, 800, 55, 80, 24, 7)`,
      [userAId, dateStr1, dateStr2, dateStr3]
    );

    // 5.4 Hydration (water_intake)
    await pool.query(
      `INSERT INTO water_intake (user_id, amount_ml, date, logged_at)
       VALUES
         ($1, 1500, $2, $5::timestamptz),
         ($1, 1200, $2, $5::timestamptz + interval '2 hours'),
         ($1, 2000, $3, $6::timestamptz),
         ($1, 1000, $3, $6::timestamptz + interval '2 hours'),
         ($1, 1800, $4, $7::timestamptz),
         ($1, 1200, $4, $7::timestamptz + interval '2 hours')`,
      [userAId, dateStr1, dateStr2, dateStr3, d1, d2, d3]
    );

    // 5.5 Weight Logs & Body Measurements
    await pool.query(
      `INSERT INTO weight_logs (user_id, weight_kg, logged_at)
       VALUES
         ($1, 84.5, $2),
         ($1, 82.8, $3),
         ($1, 81.2, $4)`,
      [userAId, d1, d2, d3]
    );

    await pool.query(
      `INSERT INTO body_measurements (user_id, waist_cm, chest_cm, hip_cm, logged_at)
       VALUES
         ($1, 88.0, 102.0, 100.0, $2),
         ($1, 85.5, 103.5, 99.0, $3)`,
      [userAId, d1, d3]
    );

    // 5.6 Goals & Habits
    await pool.query<{ id: string }>(
      `INSERT INTO goals (user_id, type, title, metric_unit, start_value, current_value, target_value, status, target_date)
       VALUES ($1, 'weightLoss', 'Cut to 78kg', 'kg', 85.0, 81.2, 78.0, 'active', $2)
       RETURNING id`,
      [userAId, new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10)]
    );

    const hRes = await pool.query<{ id: string }>(
      `INSERT INTO habits (user_id, title, category, frequency, target_days_per_week, current_streak, longest_streak, total_completions, icon, color)
       VALUES ($1, 'Drink 3L Water', 'wellness', 'daily', 7, 3, 5, 12, 'water', '#3b82f6')
       RETURNING id`,
      [userAId]
    );

    await pool.query(
      `INSERT INTO habit_completions (habit_id, user_id, date)
       VALUES
         ($1, $2, $3),
         ($1, $2, $4),
         ($1, $2, $5)`,
      [hRes.rows[0]!.id, userAId, dateStr1, dateStr2, dateStr3]
    );

    console.log('✓ Seeded complete multi-domain records for User A\n');

    // 6. Test Case 2: Live Database Verification for User A
    console.log('--- Step 4: Verification of Seeded User Records (User A) ---');

    // 6.1 Overview (7-day window: d2 [-5d] and d3 [-1d]; d1 [-10d] is in prior 7-day period)
    const aOverview = await measureRequest('GET /analytics/overview', () =>
      request(app)
        .get('/api/v1/analytics/overview')
        .set('Authorization', `Bearer ${userAToken}`)
    );
    assert.equal(aOverview.status, 200);
    assert.equal(aOverview.body.data.workoutSummary.completedSessions, 2);
    assert.equal(aOverview.body.data.workoutSummary.totalVolumeKg, 23500);
    assert.ok(aOverview.body.data.nutritionSummary.avgCalories > 2000);
    assert.ok(aOverview.body.data.hydrationSummary.avgWaterMl > 2500);
    assert.equal(aOverview.body.data.bodySummary.currentWeightKg, 81.2);
    assert.equal(aOverview.body.data.bodySummary.startWeightKg, 85.0);
    assert.equal(aOverview.body.data.bodySummary.targetWeightKg, 78.0);
    assert.ok(aOverview.body.data.comparisonVsPriorPeriod.length > 0);
    console.log('✓ 1. /analytics/overview live data verified');

    // 6.2 Workouts
    const aWorkouts = await measureRequest('GET /analytics/workouts', () =>
      request(app)
        .get('/api/v1/analytics/workouts?range=30d')
        .set('Authorization', `Bearer ${userAToken}`)
    );
    assert.equal(aWorkouts.status, 200);
    assert.equal(aWorkouts.body.data.totalSessions, 3);
    assert.equal(aWorkouts.body.data.totalVolumeKg, 33500);
    assert.ok(aWorkouts.body.data.avgDurationMin > 40);
    assert.ok(aWorkouts.body.data.frequencySeries.length > 0);
    assert.ok(aWorkouts.body.data.volumeSeries.length > 0);
    console.log('✓ 2. /analytics/workouts live data verified');

    // 6.3 Exercise Progression
    const aProgression = await measureRequest('GET /analytics/workouts/exercises/:id', () =>
      request(app)
        .get(`/api/v1/analytics/workouts/exercises/${exerciseId}?range=30d`)
        .set('Authorization', `Bearer ${userAToken}`)
    );
    assert.equal(aProgression.status, 200);
    assert.equal(aProgression.body.data.exerciseId, exerciseId);
    assert.ok(aProgression.body.data.currentPr);
    assert.equal(aProgression.body.data.progression.length, 3);
    assert.equal(aProgression.body.data.progression[2].topWeightKg, 100);
    // Verify Epley 1RM: 100 * (1 + 5/30) = 116.7
    assert.equal(Math.round(aProgression.body.data.progression[2].estimated1rmKg * 10) / 10, 116.7);
    console.log('✓ 3. /analytics/workouts/exercises/:id live progression verified');

    // 6.4 Nutrition
    const aNutrition = await measureRequest('GET /analytics/nutrition', () =>
      request(app)
        .get('/api/v1/analytics/nutrition?range=7d')
        .set('Authorization', `Bearer ${userAToken}`)
    );
    assert.equal(aNutrition.status, 200);
    assert.ok(aNutrition.body.data.avgCalories > 2000);
    assert.equal(aNutrition.body.data.targetCalories, 2200);
    assert.equal(aNutrition.body.data.macroSplit.length, 3);
    assert.ok(aNutrition.body.data.dailyTrends.length >= 3);
    console.log('✓ 4. /analytics/nutrition live trends verified');

    // 6.5 Hydration
    const aHydration = await measureRequest('GET /analytics/hydration', () =>
      request(app)
        .get('/api/v1/analytics/hydration?range=7d')
        .set('Authorization', `Bearer ${userAToken}`)
    );
    assert.equal(aHydration.status, 200);
    assert.ok(aHydration.body.data.avgWaterMl >= 2500);
    assert.ok(aHydration.body.data.points.length >= 3);
    console.log('✓ 5. /analytics/hydration live data verified');

    // 6.6 Body
    const aBody = await measureRequest('GET /analytics/body', () =>
      request(app)
        .get('/api/v1/analytics/body?range=30d')
        .set('Authorization', `Bearer ${userAToken}`)
    );
    assert.equal(aBody.status, 200);
    assert.equal(aBody.body.data.startingWeightKg, 85.0);
    assert.equal(aBody.body.data.currentWeightKg, 81.2);
    assert.equal(aBody.body.data.targetWeightKg, 78.0);
    assert.ok(aBody.body.data.weeklyVelocityKg < 0);
    assert.equal(aBody.body.data.weightTrend.length, 3);
    assert.ok(aBody.body.data.measurementTrends.waistCm);
    assert.equal(aBody.body.data.measurementTrends.waistCm.length, 2);
    console.log('✓ 6. /analytics/body live trends & measurements verified');

    // 6.7 Goals & Habits
    const aGoals = await measureRequest('GET /analytics/goals-habits', () =>
      request(app)
        .get('/api/v1/analytics/goals-habits?windowDays=30')
        .set('Authorization', `Bearer ${userAToken}`)
    );
    assert.equal(aGoals.status, 200);
    assert.equal(aGoals.body.data.goalStats.totalGoals, 1);
    assert.equal(aGoals.body.data.goalStats.active, 1);
    assert.equal(aGoals.body.data.habitsSummary.length, 1);
    assert.equal(aGoals.body.data.habitsSummary[0].title, 'Drink 3L Water');
    assert.ok(aGoals.body.data.consistencyHeatmap.length >= 3);
    console.log('✓ 7. /analytics/goals-habits live stats verified\n');

    // 7. Test Case 3: Date Range Switching
    console.log('--- Step 5: Date Range Switching Verification ---');
    for (const r of ['7d', '30d', '90d', '1y']) {
      const res = await request(app)
        .get(`/api/v1/analytics/workouts?range=${r}`)
        .set('Authorization', `Bearer ${userAToken}`);
      assert.equal(res.status, 200, `Failed range ${r} for workouts`);
    }
    console.log('✓ Workouts range switching (7d, 30d, 90d, 1y) verified');

    for (const r of ['W', 'M', '3M', 'Y']) {
      const res = await request(app)
        .get(`/api/v1/analytics/nutrition?range=${r}`)
        .set('Authorization', `Bearer ${userAToken}`);
      assert.equal(res.status, 200, `Failed range ${r} for nutrition`);
    }
    console.log('✓ Nutrition range switching (W, M, 3M, Y) verified');

    for (const r of ['W', 'M']) {
      const res = await request(app)
        .get(`/api/v1/analytics/hydration?range=${r}`)
        .set('Authorization', `Bearer ${userAToken}`);
      assert.equal(res.status, 200, `Failed range ${r} for hydration`);
    }
    console.log('✓ Hydration range switching (W, M) verified');

    for (const r of ['M', '3M', '6M', 'Y']) {
      const res = await request(app)
        .get(`/api/v1/analytics/body?range=${r}`)
        .set('Authorization', `Bearer ${userAToken}`);
      assert.equal(res.status, 200, `Failed range ${r} for body`);
    }
    console.log('✓ Body range switching (M, 3M, 6M, Y) verified\n');

    // 8. Test Case 4: Timezone & Reference Date Handling
    console.log('--- Step 6: Timezone & RefDate Parameter Verification ---');
    const tzRes = await request(app)
      .get(`/api/v1/analytics/workouts?range=30d&timezone=America/New_York&refDate=${dateStr3}`)
      .set('Authorization', `Bearer ${userAToken}`);
    assert.equal(tzRes.status, 200);
    assert.ok(tzRes.body.data.frequencySeries.length > 0);

    const tzKolkata = await request(app)
      .get(`/api/v1/analytics/nutrition?range=7d&timezone=Asia/Kolkata&refDate=${dateStr3}`)
      .set('Authorization', `Bearer ${userAToken}`);
    assert.equal(tzKolkata.status, 200);
    console.log('✓ Timezone and refDate parameterized queries verified\n');

    // 9. Test Case 5: Strict Cross-User Isolation
    console.log('--- Step 7: Cross-User Isolation Verification ---');
    const isoWorkouts = await request(app)
      .get('/api/v1/analytics/workouts?range=30d')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(isoWorkouts.body.data.totalSessions, 0, 'User B must not see User A workouts');
    assert.equal(isoWorkouts.body.data.totalVolumeKg, 0);

    const isoProgression = await request(app)
      .get(`/api/v1/analytics/workouts/exercises/${exerciseId}?range=30d`)
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(isoProgression.body.data.currentPr, null, 'User B must not see User A PR');
    assert.equal(isoProgression.body.data.progression.length, 0);

    const isoNutrition = await request(app)
      .get('/api/v1/analytics/nutrition?range=7d')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(isoNutrition.body.data.avgCalories, 0, 'User B must not see User A meals');

    const isoBody = await request(app)
      .get('/api/v1/analytics/body?range=30d')
      .set('Authorization', `Bearer ${userBToken}`);
    assert.equal(isoBody.body.data.weightTrend.length, 0, 'User B must not see User A weights');

    console.log('✓ Verified: Zero cross-user data leakage across all domains\n');

    // 10. Test Case 6: Authentication & Input Validation
    console.log('--- Step 8: Auth & Input Validation Rejection Tests ---');
    const noAuth = await request(app).get('/api/v1/analytics/overview');
    assert.equal(noAuth.status, 401, 'Must reject unauthenticated requests');

    const badRange = await request(app)
      .get('/api/v1/analytics/workouts?range=invalid_range')
      .set('Authorization', `Bearer ${userAToken}`);
    assert.equal(badRange.status, 400, 'Must reject invalid range');
    assert.equal(badRange.body.error.code, 'VALIDATION_FAILED');

    const badTimezone = await request(app)
      .get('/api/v1/analytics/nutrition?timezone=Not_A_Timezone')
      .set('Authorization', `Bearer ${userAToken}`);
    assert.equal(badTimezone.status, 400, 'Must reject invalid IANA timezone');

    const badRefDate = await request(app)
      .get('/api/v1/analytics/hydration?refDate=07-11-2026')
      .set('Authorization', `Bearer ${userAToken}`);
    assert.equal(badRefDate.status, 400, 'Must reject non-ISO refDate');

    console.log('✓ Validation and security rejections verified\n');

    // 11. Performance Report
    console.log('--- Step 9: Performance & Response Latencies ---');
    console.table(
      latencies.map((l) => ({
        Endpoint: l.endpoint,
        'Min (ms)': l.minMs,
        'Max (ms)': l.maxMs,
        'Avg (ms)': l.avgMs,
      }))
    );

    console.log('\n=================================================================');
    console.log('✅ ALL PHASE 8.6 E2E VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('=================================================================\n');
  } catch (err) {
    console.error('\n❌ E2E VERIFICATION FAILED:', err);
    throw err;
  } finally {
    // 12. Cleanup QA Fixtures
    console.log('--- Step 10: Cleaning up isolated QA test fixtures ---');
    try {
      if (userAId) {
        await pool.query(`DELETE FROM habit_completions WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM habits WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM goals WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM personal_records WHERE user_id = $1`, [userAId]);
        await pool.query(
          `DELETE FROM workout_session_sets WHERE session_id IN (SELECT id FROM workout_sessions WHERE user_id = $1)`,
          [userAId]
        );
        await pool.query(`DELETE FROM workout_sessions WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM meals WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM water_intake WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM body_measurements WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM weight_logs WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [userAId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [userAId]);
      }
      if (userBId) {
        await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [userBId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [userBId]);
      }
      console.log('✓ QA fixtures cleaned up cleanly from database.');
    } catch (cleanupErr) {
      console.error('Warning during cleanup:', cleanupErr);
    } finally {
      await pool.end();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
