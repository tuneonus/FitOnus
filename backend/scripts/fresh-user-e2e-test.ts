import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    requestId?: string;
  };
  message?: string;
}

const BASE_URL = 'http://localhost:3000/api/v1';

async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = (await res.json()) as ApiResponse<T>;
  return { status: res.status, body: json };
}

async function main() {
  console.log('=================================================================');
  console.log('FITONUS FRESH USER END-TO-END TEST (NEON DEV)');
  console.log('=================================================================\n');

  // Verify DB safety
  const config = loadConfig();
  const pool = createPool(config.database);

  const branchRes = await pool.query<{ setting: string }>(
    "SELECT setting FROM pg_settings WHERE name = 'neon.branch_id'",
  );
  const currentBranch = branchRes.rows[0]?.setting;
  console.log(`[Safety] Connected Neon branch_id: ${currentBranch}`);
  assert.equal(
    currentBranch,
    'br-fragrant-morning-b35lwkjg',
    'CRITICAL: Must run against Neon Dev branch only!',
  );
  console.log('✓ Safety check passed: Neon Dev branch confirmed.\n');

  // 1. Dedicated fresh test user credentials
  const timestamp = Date.now();
  const testUser = {
    displayName: `Beta Fresh ${timestamp}`,
    email: `fresh_beta_${timestamp}@fitonus.test`,
    password: `P@ssw0rd_${timestamp}_Secure!`,
  };

  console.log(`--- Journey 1: Signup / Register Fresh User ---`);
  console.log(`Registering: ${testUser.email}`);
  const registerRes = await apiRequest('/auth/register', {
    method: 'POST',
    body: testUser,
  });
  assert.equal(registerRes.status, 201, `Register failed: ${JSON.stringify(registerRes.body)}`);
  assert.equal(registerRes.body.success, true);
  let accessToken = registerRes.body.data.accessToken;
  console.log(`✓ Account registered successfully. Access & Refresh tokens generated.`);

  // Get current user details from /users/me
  const meRes = await apiRequest('/users/me', { token: accessToken });
  assert.equal(meRes.status, 200);
  const userId = meRes.body.data.id;
  console.log(`✓ User profile identity: ID ${userId}, Name: ${meRes.body.data.displayName}, Email: ${meRes.body.data.email}`);

  // Check initial profile state
  const initialProfileRes = await apiRequest('/profile/me', { token: accessToken });
  assert.equal(initialProfileRes.status, 200);
  assert.equal(initialProfileRes.body.data.onboardingCompleted, false);
  console.log(`✓ Initial onboardingCompleted flag: ${initialProfileRes.body.data.onboardingCompleted}`);

  console.log(`\n--- Journey 2: Step-by-Step Onboarding ---`);
  const steps: { step: string; data: Record<string, any> }[] = [
    { step: 'personal', data: { name: 'Fresh Tester', sex: 'male' } },
    { step: 'dob', data: { dobYear: 1996, dobMonth: 7, dobDay: 20 } },
    { step: 'height', data: { heightCm: 178 } },
    { step: 'weight', data: { weightKg: 75.5 } },
    { step: 'experience', data: { experience: 'intermediate' } },
    { step: 'goal', data: { goal: 'gain' } },
    { step: 'workoutPreference', data: { place: 'gym', daysPerWeek: 4, durationMin: 60 } },
    { step: 'equipment', data: { equipment: ['barbell', 'dumbbells', 'cables', 'bench'] } },
    { step: 'duration', data: { durationMin: 60 } },
    { step: 'food', data: { diet: 'none', allergies: [], cuisines: ['South Indian', 'Mediterranean'] } },
    { step: 'health', data: { healthAllowed: true } },
    { step: 'device', data: { deviceConnected: false } },
  ];

  for (const s of steps) {
    const stepRes = await apiRequest('/profile/onboarding/step', {
      method: 'POST',
      token: accessToken,
      body: s,
    });
    assert.equal(stepRes.status, 200, `Step ${s.step} failed: ${JSON.stringify(stepRes.body)}`);
    console.log(`  ✓ Saved step: ${s.step}`);
  }

  // Complete onboarding
  console.log('Finalizing onboarding via /profile/onboarding/complete...');
  const completeRes = await apiRequest('/profile/onboarding/complete', {
    method: 'POST',
    token: accessToken,
    body: {},
  });
  assert.equal(completeRes.status, 200, `Complete onboarding failed: ${JSON.stringify(completeRes.body)}`);
  assert.equal(completeRes.body.data.onboardingCompleted, true);
  console.log(`✓ Onboarding completed! Daily calorie target: ${completeRes.body.data.calculatedPlan.dailyCalorieTarget} kcal`);
  console.log(`✓ Protein target: ${completeRes.body.data.calculatedPlan.dailyProteinGrams} g, Workouts/week: ${completeRes.body.data.calculatedPlan.workoutsPerWeek}, Milestone: ${completeRes.body.data.calculatedPlan.projectedMilestone}`);

  console.log(`\n--- Journey 3: First-Time User Navigation & Empty States ---`);
  // Dashboard
  const dashRes = await apiRequest('/dashboard/summary', { token: accessToken });
  assert.equal(dashRes.status, 200, `Dashboard failed: ${JSON.stringify(dashRes.body)}`);
  console.log('Dashboard initial state:');
  console.log(`  - Calories consumed: ${dashRes.body.data.summary.caloriesConsumed}`);
  console.log(`  - Water consumed: ${dashRes.body.data.summary.waterIntakeMl ?? dashRes.body.data.summary.waterIntake} ml`);
  console.log(`  - Active minutes: ${dashRes.body.data.summary.activeMinutes}`);
  console.log(`  - Recent activities: ${dashRes.body.data.recentActivity.length}`);
  assert.equal(dashRes.body.data.summary.caloriesConsumed, 0, 'Must have 0 initial calories');
  assert.equal(dashRes.body.data.summary.waterIntakeMl ?? dashRes.body.data.summary.waterIntake, 0, 'Must have 0 initial water');
  assert.equal(dashRes.body.data.recentActivity.length, 0, 'Must have 0 initial activities');

  // Nutrition Daily
  const todayStr = new Date().toISOString().slice(0, 10);
  const nutDailyRes = await apiRequest(`/nutrition/daily?date=${todayStr}`, { token: accessToken });
  assert.equal(nutDailyRes.status, 200, `Nutrition daily failed: ${JSON.stringify(nutDailyRes.body)}`);
  assert.equal(nutDailyRes.body.data.consumed.calories, 0);
  assert.equal(nutDailyRes.body.data.consumed.waterMl, 0);
  assert.equal(nutDailyRes.body.data.meals.length, 0);
  console.log('✓ Nutrition daily initial empty state verified: 0 meals, 0 calories, 0 water.');

  // Workout sessions history
  const workoutHistRes = await apiRequest('/workouts/sessions', { token: accessToken });
  assert.equal(workoutHistRes.status, 200);
  assert.equal(workoutHistRes.body.data.length, 0);
  console.log('✓ Workout history initial empty state verified: 0 completed sessions.');

  console.log(`\n--- Journey 4: First Workout Logging ---`);
  // Get an exercise to log
  const exercisesRes = await apiRequest('/workouts/exercises?limit=5', { token: accessToken });
  assert.equal(exercisesRes.status, 200);
  const exercise = exercisesRes.body.data[0];
  console.log(`Selected catalog exercise: ${exercise.name} (ID: ${exercise.id})`);

  const now = new Date();
  const startTime = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
  const endTime = now.toISOString();

  const workoutPayload = {
    workoutName: 'First Upper Body Session',
    startedAt: startTime,
    completedAt: endTime,
    durationSeconds: 2700,
    difficultyRating: 4,
    notes: 'Great first session, felt energetic!',
    caloriesBurned: 320,
    caloriesSource: 'estimated',
    sets: [
      {
        exerciseId: exercise.id,
        setNumber: 1,
        weightKg: 40,
        reps: 12,
        isWarmup: true,
        rpe: 6,
      },
      {
        exerciseId: exercise.id,
        setNumber: 2,
        weightKg: 60,
        reps: 10,
        isWarmup: false,
        rpe: 8,
      },
      {
        exerciseId: exercise.id,
        setNumber: 3,
        weightKg: 65,
        reps: 8,
        isWarmup: false,
        rpe: 9,
      },
    ],
  };

  const logWorkoutRes = await apiRequest('/workouts/sessions', {
    method: 'POST',
    token: accessToken,
    body: workoutPayload,
  });
  assert.equal(logWorkoutRes.status, 201, `Workout log failed: ${JSON.stringify(logWorkoutRes.body)}`);
  const loggedSession = logWorkoutRes.body.data;
  console.log(`✓ Workout session logged: ID ${loggedSession.id}`);
  console.log(`  - Total volume: ${loggedSession.totalVolumeKg} kg`);
  console.log(`  - Calories burned: ${loggedSession.caloriesBurned} kcal`);
  console.log(`  - Sets logged: ${loggedSession.sets?.length}`);

  console.log(`\n--- Journey 5: First Water Logging ---`);
  const waterRes = await apiRequest('/nutrition/water', {
    method: 'POST',
    token: accessToken,
    body: {
      date: todayStr,
      amountMl: 500,
    },
  });
  assert.equal(waterRes.status, 201, `Water log failed: ${JSON.stringify(waterRes.body)}`);
  console.log(`✓ Water logged: 500 ml`);

  console.log(`\n--- Journey 6: Meal Photo Multimodal AI Analysis ---`);
  // Load real food photo from mobile assets
  const foodImagePath = path.resolve('../mobile/assets/images/dd64297a-6168-4360-b842-2d92ca0c7c81.jpg');
  console.log(`Reading real food image: ${foodImagePath}`);
  const imageBuffer = fs.readFileSync(foodImagePath);
  const imageBase64 = imageBuffer.toString('base64');
  console.log(`Image loaded. Size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  console.log('Sending photo to /nutrition/meal-photo/analyze...');
  const photoAnalysisRes = await apiRequest('/nutrition/meal-photo/analyze', {
    method: 'POST',
    token: accessToken,
    body: {
      image: imageBase64,
      mimeType: 'image/jpeg',
      mealType: 'lunch',
    },
  });
  assert.equal(photoAnalysisRes.status, 200, `Photo analysis failed: ${JSON.stringify(photoAnalysisRes.body)}`);
  const photoData = photoAnalysisRes.body.data;
  console.log(`✓ Gemini AI Photo Analysis Result:`);
  console.log(`  - Is food detected: ${photoData.isFood}`);
  console.log(`  - Overall confidence: ${(photoData.overallConfidence * 100).toFixed(0)}%`);
  console.log(`  - Detected items count: ${photoData.items.length}`);
  for (const item of photoData.items) {
    console.log(`    * ${item.name} (${item.serving}): ${item.kcal} kcal, P:${item.protein}g, C:${item.carbs}g, F:${item.fat}g [AI estimate: ${item.isAiEstimated}]`);
  }
  assert.ok(photoData.items.length > 0, 'Should detect at least 1 food item from real food photo');

  console.log(`\n--- Journey 7: Voice Meal AI Parsing (English & Tanglish) ---`);
  const voiceQuery = 'I had 2 idlis with sambar and one cup of filter coffee for breakfast';
  console.log(`Parsing voice meal description: "${voiceQuery}"`);
  const voiceRes = await apiRequest('/nutrition/voice-meal/parse', {
    method: 'POST',
    token: accessToken,
    body: {
      transcript: voiceQuery,
      mealType: 'breakfast',
    },
  });
  assert.equal(voiceRes.status, 200, `Voice meal parse failed: ${JSON.stringify(voiceRes.body)}`);
  const voiceData = voiceRes.body.data;
  console.log(`✓ Gemini AI Voice Parse Result:`);
  console.log(`  - Detected language: ${voiceData.detectedLanguage}`);
  console.log(`  - Confidence: ${voiceData.confidence}`);
  console.log(`  - Items parsed: ${voiceData.items.length}`);
  for (const item of voiceData.items) {
    console.log(`    * ${item.name} (${item.servingSize ?? 1} ${item.servingUnit ?? item.serving}): ${item.kcal} kcal, P:${item.protein}g, C:${item.carbs}g, F:${item.fat}g`);
  }
  assert.ok(voiceData.items.length >= 2, 'Should parse multiple items from voice description');

  console.log(`\n--- Journey 8: Meal Confirmation & Neon Database Persistence ---`);
  // Confirm and log the voice meal items into user's diary
  const mealItemsToLog = voiceData.items.map((it: any) => ({
    foodName: it.name,
    servingSize: it.servingSize || 1,
    servingUnit: it.servingUnit || 'serving',
    servingMultiplier: 1.0,
    servingWeightG: it.servingWeightG || 100,
    calories: it.kcal,
    proteinG: it.protein,
    carbsG: it.carbs,
    fatG: it.fat,
  }));

  const logMealRes = await apiRequest('/nutrition/meals', {
    method: 'POST',
    token: accessToken,
    body: {
      mealType: 'breakfast',
      date: todayStr,
      notes: 'Logged via Voice Meal AI',
      items: mealItemsToLog,
    },
  });
  assert.equal(logMealRes.status, 201, `Meal confirmation failed: ${JSON.stringify(logMealRes.body)}`);
  const confirmedMeal = logMealRes.body.data;
  console.log(`✓ Meal confirmed and saved via API: ID ${confirmedMeal.id}`);
  console.log(`  - Total meal calories: ${confirmedMeal.totalCalories} kcal`);
  console.log(`  - Total items: ${confirmedMeal.items?.length}`);

  // Query raw PostgreSQL on Neon Dev directly to confirm persistence
  console.log('\nQuerying PostgreSQL on Neon Dev directly to verify persistence...');
  const dbMealRes = await pool.query(
    'SELECT id, user_id, meal_type, date, total_calories, notes FROM meals WHERE id = $1',
    [confirmedMeal.id],
  );
  assert.equal(dbMealRes.rows.length, 1, 'Meal must exist in Neon PostgreSQL database');
  const dbMeal = dbMealRes.rows[0];
  console.log('✓ Raw Neon DB Meal Row:', dbMeal);
  assert.equal(dbMeal.user_id, userId);
  assert.equal(Number(dbMeal.total_calories), confirmedMeal.totalCalories);

  const dbItemsRes = await pool.query(
    'SELECT id, food_name, calories, protein_g, carbs_g, fat_g FROM meal_items WHERE meal_id = $1',
    [confirmedMeal.id],
  );
  console.log(`✓ Raw Neon DB Meal Items (${dbItemsRes.rows.length} rows):`);
  for (const item of dbItemsRes.rows) {
    console.log(`  - ${item.food_name}: ${item.calories} kcal`);
  }
  assert.equal(dbItemsRes.rows.length, mealItemsToLog.length);

  console.log(`\n--- Journey 9: Verify Real Data in Dashboard, Daily Nutrition & Analytics ---`);
  // Refetch Dashboard
  const refetchedDash = await apiRequest('/dashboard/summary', { token: accessToken });
  assert.equal(refetchedDash.status, 200);
  console.log('Updated Dashboard:');
  console.log(`  - Calories consumed: ${refetchedDash.body.data.summary.caloriesConsumed} (must be > 0)`);
  console.log(`  - Water consumed: ${refetchedDash.body.data.summary.waterIntakeMl ?? refetchedDash.body.data.summary.waterIntake} ml (must be 500)`);
  console.log(`  - Recent activities: ${refetchedDash.body.data.recentActivity.length} (must be >= 2)`);
  assert.ok(refetchedDash.body.data.summary.caloriesConsumed > 0, 'Dashboard calories must reflect logged meal');
  assert.equal(refetchedDash.body.data.summary.waterIntakeMl ?? refetchedDash.body.data.summary.waterIntake, 500, 'Dashboard water must reflect logged water');
  assert.ok(refetchedDash.body.data.recentActivity.length >= 2, 'Dashboard recent activities must reflect logged session & meal');

  // Refetch Nutrition Daily
  const refetchedDaily = await apiRequest(`/nutrition/daily?date=${todayStr}`, { token: accessToken });
  assert.equal(refetchedDaily.status, 200);
  console.log('Updated Nutrition Daily:');
  console.log(`  - Meals logged: ${refetchedDaily.body.data.meals.length}`);
  console.log(`  - Consumed calories: ${refetchedDaily.body.data.consumed.calories}`);
  console.log(`  - Water: ${refetchedDaily.body.data.consumed.waterMl} ml`);
  assert.equal(refetchedDaily.body.data.meals.length, 1);
  assert.equal(refetchedDaily.body.data.consumed.waterMl, 500);

  // Activity Overview Analytics
  const activityRes = await apiRequest('/analytics/overview', { token: accessToken });
  assert.equal(activityRes.status, 200);
  console.log('Activity Overview Analytics:');
  console.log(`  - Completed workout sessions: ${activityRes.body.data.workoutSummary.completedSessions}`);
  console.log(`  - Total volume: ${activityRes.body.data.workoutSummary.totalVolumeKg} kg`);
  console.log(`  - Total duration minutes: ${activityRes.body.data.workoutSummary.totalDurationMinutes}`);
  assert.equal(activityRes.body.data.workoutSummary.completedSessions, 1);
  assert.equal(activityRes.body.data.workoutSummary.totalVolumeKg, 1600);

  console.log(`\n--- Journey 10: AI Coach & Personalized Insights ---`);
  // Coach Insights
  console.log('Fetching personalized AI Coach insights...');
  const insightsRes = await apiRequest('/coach/insights', { token: accessToken });
  assert.equal(insightsRes.status, 200, `Coach insights failed: ${JSON.stringify(insightsRes.body)}`);
  console.log(`✓ AI Coach Insights retrieved (${insightsRes.body.data.insights.length} insights):`);
  for (const ins of insightsRes.body.data.insights) {
    console.log(`  [${(ins.category || 'INSIGHT').toUpperCase()}] ${ins.title}: ${ins.description}`);
  }
  assert.ok(insightsRes.body.data.insights.length > 0, 'Must generate personalized insights for user');

  // Coach Live Chat
  console.log('\nTesting live AI Coach Chat...');
  const chatQuestion = 'I just finished my first workout (45 mins upper body) and had my breakfast. How am I progressing toward my goal to build muscle today?';
  console.log(`User prompt: "${chatQuestion}"`);
  const chatRes = await apiRequest('/coach/chat', {
    method: 'POST',
    token: accessToken,
    body: {
      message: chatQuestion,
    },
  });
  assert.equal(chatRes.status, 200, `Coach chat failed: ${JSON.stringify(chatRes.body)}`);
  const coachReply = chatRes.body.data;
  console.log(`✓ AI Coach Response:`);
  console.log(`  Text: "${coachReply.text}"`);
  console.log(`  Follow-ups: ${JSON.stringify(coachReply.followUps)}`);
  assert.ok(coachReply.text.length > 20, 'Coach should return meaningful guidance');

  console.log(`\n--- Journey 11: Logout, Login & Session Persistence ---`);
  // Logout
  const logoutRes = await apiRequest('/auth/logout', {
    method: 'POST',
    token: accessToken,
    body: {},
  });
  assert.equal(logoutRes.status, 200, `Logout failed: ${JSON.stringify(logoutRes.body)}`);
  console.log('✓ Successfully logged out.');

  // Re-login
  console.log('Re-authenticating with login credentials...');
  const reLoginRes = await apiRequest('/auth/login', {
    method: 'POST',
    body: {
      email: testUser.email,
      password: testUser.password,
    },
  });
  assert.equal(reLoginRes.status, 200, `Re-login failed: ${JSON.stringify(reLoginRes.body)}`);
  accessToken = reLoginRes.body.data.accessToken;
  console.log('✓ Re-login successful. Session re-established.');

  // Re-verify profile and dashboard after re-login
  const reProfileRes = await apiRequest('/profile/me', { token: accessToken });
  assert.equal(reProfileRes.status, 200);
  assert.equal(reProfileRes.body.data.onboardingCompleted, true);
  assert.equal(reProfileRes.body.data.primaryGoal, 'gain');
  console.log('✓ Profile data intact after re-login (onboardingCompleted: true, goal: gain).');

  const reDashRes = await apiRequest('/dashboard/summary', { token: accessToken });
  assert.equal(reDashRes.status, 200);
  assert.ok(reDashRes.body.data.summary.caloriesConsumed > 0);
  assert.equal(reDashRes.body.data.summary.waterIntakeMl ?? reDashRes.body.data.summary.waterIntake, 500);
  assert.ok(reDashRes.body.data.recentActivity.length >= 2);
  console.log('✓ Dashboard persisted data intact after re-login.');

  await pool.end();
  console.log('\n=================================================================');
  console.log('ALL FRESH USER END-TO-END JOURNEYS VERIFIED WITH NEON DEV & GEMINI AI!');
  console.log('=================================================================');
}

main().catch((err) => {
  console.error('\nE2E VERIFICATION FAILED:', err);
  process.exit(1);
});
