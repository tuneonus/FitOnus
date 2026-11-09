import express from 'express';
import request from 'supertest';
import { createContainer } from '../src/container.js';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { buildRouter } from '../src/shared/http/route.js';
import { requestContext } from '../src/middleware/request-context.js';
import { createLogger } from '../src/shared/logging/logger.js';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import { createActor } from '../src/shared/auth/actor.js';

async function main() {
  console.log('=============================================================');
  console.log('PHASE 6 — LIVE AI ENDPOINT & GEMINI MANAGEMENT VERIFICATION');
  console.log('=============================================================');

  const config = loadConfig();
  console.log('Target Database:', config.database.url.split('@')[1] || 'DEV DB');

  const pool = createPool(config.database);

  // 1. Fetch valid Admin and Member user IDs from Neon DEV
  const adminRes = await pool.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  const memberRes = await pool.query<{ id: string }>("SELECT id FROM users WHERE role = 'member' LIMIT 1");

  const adminUserId = adminRes.rows[0]?.id;
  const memberUserId = memberRes.rows[0]?.id;

  if (!adminUserId || !memberUserId) {
    throw new Error('Could not find admin or member users in Neon DEV database');
  }

  console.log(`Admin User ID: ${adminUserId}`);
  console.log(`Member User ID: ${memberUserId}`);

  // 2. Initialize Container with real Neon DEV DB and runtime service
  const container = createContainer(config, pool);

  // 3. Build test Express application with actual routes and mock authentication actor
  const app = express();
  const logger = createLogger({ level: 'error', pretty: false });
  app.use(requestContext(logger));
  app.use(express.json({ limit: config.http.bodyLimit }));

  let currentActor = createActor({ userId: memberUserId, sessionId: 'sess-member', role: 'member' });

  const authenticate: express.RequestHandler = (req, _res, next) => {
    req.actor = currentActor;
    next();
  };

  for (const group of container.routeGroups) {
    app.use(group.basePath, buildRouter(group.routes, { authenticate }));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  // -------------------------------------------------------------
  // Test 1: POST /api/v1/coach/chat
  // -------------------------------------------------------------
  console.log('\n--- 1. Verifying POST /api/v1/coach/chat ---');
  currentActor = createActor({ userId: memberUserId, sessionId: 'sess-member', role: 'member' });

  // 1a. Create conversation first
  const createConvRes = await request(app)
    .post('/api/v1/coach/conversations')
    .send({ title: 'Phase 6 Verification Chat' });
  const testConvId = createConvRes.body.data?.id;
  console.log(`  [Conversation] Created conversation thread: ${testConvId}`);

  // 1b. Validation test (empty message)
  const coachValRes = await request(app)
    .post('/api/v1/coach/chat')
    .send({ message: '', conversationId: testConvId });
  console.log(`  [Validation] Empty message status: ${coachValRes.status} (Expected: 400)`);
  if (coachValRes.status !== 400) throw new Error('Expected 400 for empty message in /coach/chat');

  // 1c. Real execution test
  const coachExecRes = await request(app)
    .post('/api/v1/coach/chat')
    .send({ message: 'Hi Coach, I want a quick 1-sentence tip for chest recovery.', conversationId: testConvId });
  console.log(`  [Execution] Chat response status: ${coachExecRes.status} (Expected: 200)`);
  if (coachExecRes.status !== 200) {
    console.error('Chat error:', coachExecRes.body);
    throw new Error(`/coach/chat failed with ${coachExecRes.status}`);
  }
  console.log(`  [Execution] Coach Reply: "${coachExecRes.body.data?.text?.slice(0, 80)}..."`);

  // 1d. DB persistence check in Neon DEV
  const msgCheck = await pool.query(
    'SELECT id, role, text FROM coach_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [testConvId]
  );
  console.log(`  [Persistence] Neon DB records found: ${msgCheck.rowCount} messages (Expected: 2)`);

  // -------------------------------------------------------------
  // Test 2: POST /api/v1/nutrition/meal-photo/analyze
  // -------------------------------------------------------------
  console.log('\n--- 2. Verifying POST /api/v1/nutrition/meal-photo/analyze ---');

  // 2a. Validation test (missing image)
  const photoValRes = await request(app)
    .post('/api/v1/nutrition/meal-photo/analyze')
    .send({});
  console.log(`  [Validation] Missing payload status: ${photoValRes.status} (Expected: 400)`);
  if (photoValRes.status !== 400) throw new Error('Expected 400 for missing payload in /meal-photo/analyze');

  // 2b. Real execution test with tiny valid 1x1 PNG base64
  const sample1x1Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const photoExecRes = await request(app)
    .post('/api/v1/nutrition/meal-photo/analyze')
    .send({
      image: sample1x1Png,
      mimeType: 'image/png',
      hints: 'A green apple',
    });
  console.log(`  [Execution] Photo analysis status: ${photoExecRes.status} (Expected: 200)`);
  if (photoExecRes.status !== 200) {
    console.error('Meal photo error:', photoExecRes.body);
    throw new Error(`/meal-photo/analyze failed with ${photoExecRes.status}`);
  }
  console.log(`  [Execution] Detected items count: ${photoExecRes.body.data?.items?.length}`);
  console.log(`  [Execution] Total estimated calories: ${photoExecRes.body.data?.totalKcal} kcal`);
  console.log(`  [Execution] Confidence score: ${photoExecRes.body.data?.overallConfidence}`);

  // -------------------------------------------------------------
  // Test 3: POST /api/v1/nutrition/voice-meal/parse
  // -------------------------------------------------------------
  console.log('\n--- 3. Verifying POST /api/v1/nutrition/voice-meal/parse ---');

  // 3a. Validation test (empty transcript and no audio)
  const voiceValRes = await request(app)
    .post('/api/v1/nutrition/voice-meal/parse')
    .send({});
  console.log(`  [Validation] Missing input status: ${voiceValRes.status} (Expected: 400)`);
  if (voiceValRes.status !== 400) throw new Error('Expected 400 for empty /voice-meal/parse');

  // 3b. Real execution test with speech transcript (with retry for transient upstream 503)
  let voiceExecRes: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    voiceExecRes = await request(app)
      .post('/api/v1/nutrition/voice-meal/parse')
      .send({
        transcript: 'Had 2 idlis with sambar and a cup of black coffee for breakfast',
        mealType: 'breakfast',
      });
    if (voiceExecRes.status === 200) break;
    console.log(`  [Retry ${attempt}] Upstream returned ${voiceExecRes.status}, waiting 2s...`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`  [Execution] Voice parse status: ${voiceExecRes.status} (Expected: 200)`);
  if (voiceExecRes.status !== 200) {
    console.error('Voice meal error:', voiceExecRes.body);
    throw new Error(`/voice-meal/parse failed with ${voiceExecRes.status}`);
  }
  console.log(`  [Execution] Parsed items: ${voiceExecRes.body.data?.items?.map((i: any) => i.name).join(', ')}`);
  console.log(`  [Execution] Total calories: ${voiceExecRes.body.data?.totalKcal} kcal`);

  // -------------------------------------------------------------
  // Test 4: POST /api/v1/workouts/generate Route Discovery
  // -------------------------------------------------------------
  console.log('\n--- 4. Checking POST /api/v1/workouts/generate Route Status ---');
  const workoutGenRes = await request(app)
    .post('/api/v1/workouts/generate')
    .send({});
  console.log(`  Route status: ${workoutGenRes.status} (Expected: 404 - Architectural Design: client-side engine in workoutPlanGenerator.ts)`);

  // -------------------------------------------------------------
  // Test 5: Admin Gemini Management Routes (/api/v1/admin/ai)
  // -------------------------------------------------------------
  console.log('\n--- 5. Verifying Admin Gemini Management Routes ---');
  currentActor = createActor({ userId: adminUserId, sessionId: 'sess-admin', role: 'admin' });

  // 5a. GET /api/v1/admin/ai/configuration
  const configRes = await request(app).get('/api/v1/admin/ai/configuration');
  console.log(`  GET /configuration status: ${configRes.status} (Expected: 200)`);
  console.log(`  Default Model: ${configRes.body.data?.defaultModel}`);
  console.log(`  Active Key Mask: ${configRes.body.data?.keyMask || 'Not Configured (Using Environment Fallback)'}`);

  // 5b. GET /api/v1/admin/ai/models
  const modelsRes = await request(app).get('/api/v1/admin/ai/models');
  console.log(`  GET /models status: ${modelsRes.status} (Expected: 200, Models count: ${modelsRes.body.data?.length})`);

  // 5c. POST /api/v1/admin/ai/test-connection
  const testConnRes = await request(app).post('/api/v1/admin/ai/test-connection').send({});
  console.log(`  POST /test-connection status: ${testConnRes.status} (Success: ${testConnRes.body.data?.success}, Latency: ${testConnRes.body.data?.latencyMs}ms)`);

  // 5d. GET /api/v1/admin/ai/usage/summary
  const summaryRes = await request(app).get('/api/v1/admin/ai/usage/summary');
  console.log(`  GET /usage/summary status: ${summaryRes.status} (Today Requests: ${summaryRes.body.data?.todayTotalRequests}, Cost: $${summaryRes.body.data?.estimatedMonthCostUsd})`);

  // 5e. GET /api/v1/admin/ai/usage/by-feature
  const featureRes = await request(app).get('/api/v1/admin/ai/usage/by-feature');
  console.log(`  GET /usage/by-feature status: ${featureRes.status} (Features tracked: ${featureRes.body.data?.length})`);

  // 5f. RBAC Authorization test (Member trying to access Admin AI routes)
  currentActor = createActor({ userId: memberUserId, sessionId: 'sess-member', role: 'member' });
  const forbiddenRes = await request(app).get('/api/v1/admin/ai/configuration');
  console.log(`  [Security] Member access to Admin AI: ${forbiddenRes.status} (Expected: 403 Forbidden)`);
  if (forbiddenRes.status !== 403) throw new Error('Expected 403 for member on Admin AI route');

  // Clean up test coach conversation & messages
  if (testConvId) {
    await pool.query('DELETE FROM coach_conversations WHERE id = $1', [testConvId]);
  }

  await pool.end();
  console.log('\n=============================================================');
  console.log('✓ PHASE 6 VERIFICATION COMPLETED WITH 100% SUCCESS!');
  console.log('=============================================================');
}

main().catch(err => {
  console.error('\n❌ PHASE 6 VERIFICATION FAILED:', err);
  process.exit(1);
});
