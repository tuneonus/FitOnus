import { execSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import { runMigrations } from '../src/database/migration-runner.js';
import { createProgressModule } from '../src/modules/progress/index.js';
import { errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import { requestContext } from '../src/middleware/request-context.js';
import { createActor } from '../src/shared/auth/actor.js';
import { buildRouter } from '../src/shared/http/route.js';
import { createLogger } from '../src/shared/logging/logger.js';
import { Database } from '../src/database/transaction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PG_DIR = '/tmp/fitonus-test-pg-5-4';
const PG_PORT = 5435;
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

async function main() {
  console.log('=== FitOnus Task 5.4: HTTP API & Database Integration Verification ===\n');

  try {
    execSync(`/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} stop -m immediate 2>/dev/null || true`);
    rmSync(PG_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }

  mkdirSync(PG_DIR, { recursive: true });

  console.log('-> Initializing ephemeral PostgreSQL 16 cluster...');
  execSync(`/usr/lib/postgresql/16/bin/initdb -D ${PG_DIR} --no-locale -E UTF8 > /dev/null`);

  console.log(`-> Starting isolated PostgreSQL on port ${PG_PORT}...`);
  execSync(
    `/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} -o "-p ${PG_PORT} -k /tmp" -l ${PG_DIR}/server.log start`,
  );

  const connectionString = `postgresql://localhost:${PG_PORT}/postgres?host=/tmp`;
  const pool = new pg.Pool({ connectionString });

  try {
    console.log('-> Applying migrations 0001 -> 0009...');
    await runMigrations({ pool, directory: MIGRATIONS_DIR });
    console.log('✓ Migrations 0001 to 0009 applied successfully.');

    const database = new Database(pool);
    const user1 = '11111111-2222-4333-8444-555555555555';
    const user2 = '99999999-8888-4777-8666-555555555555';

    await pool.query(
      `
      INSERT INTO users (id, email, display_name, password_hash, role) VALUES 
      ($1, 'progress.user1@test.com', 'Progress User 1', 'hash1', 'member'),
      ($2, 'progress.user2@test.com', 'Progress User 2', 'hash2', 'member');
    `,
      [user1, user2],
    );

    await pool.query(
      `
      INSERT INTO user_profiles (user_id, height_cm, current_weight_kg, starting_weight_kg, target_weight_kg)
      VALUES ($1::uuid, 180.0, 85.0, 85.0, 75.0), ($2::uuid, 168.0, 65.0, 65.0, 60.0);
    `,
      [user1, user2],
    );
    console.log('✓ Seeded users and baseline profiles.');

    // 1. Direct Repository Update Verification
    console.log('\n--- 1. Testing Weight & Measurement Repository update() operations ---');
    const progressModule = createProgressModule({
      basePath: '/api/v1/progress',
      db: database,
    });

    // Test weight update
    const initialLog = await progressModule.controller.logWeight({
      actor: createActor({ userId: user1, sessionId: 's1', role: 'member' }),
      body: {
        weightKg: 84.5,
        loggedAt: '2026-11-01T10:00:00.000Z',
        notes: 'Initial weigh-in',
      },
      validated: {
        body: {
          weightKg: 84.5,
          loggedAt: '2026-11-01T10:00:00.000Z',
          source: 'manual',
          notes: 'Initial weigh-in',
        },
      },
    } as any);

    const logId = initialLog.data.log.id;
    console.log(`✓ Initial weight log created: ${logId}, weight=${initialLog.data.log.weightKg}`);

    const updatedLog = await progressModule.weightRepo.update(logId, user1, {
      weightKg: 83.8,
      notes: 'Corrected weigh-in',
    });
    if (!updatedLog || updatedLog.weightKg !== 83.8 || updatedLog.notes !== 'Corrected weigh-in') {
      throw new Error(`Weight update failed: ${JSON.stringify(updatedLog)}`);
    }

    // Verify profile synchronization trigger updated current_weight_kg
    const profileRes = await pool.query<{ current_weight_kg: string }>(
      'SELECT current_weight_kg FROM user_profiles WHERE user_id = $1',
      [user1],
    );
    if (Number(profileRes.rows[0]?.current_weight_kg) !== 83.8) {
      throw new Error(
        `Profile sync failed after update: expected 83.8, got ${profileRes.rows[0]?.current_weight_kg}`,
      );
    }
    console.log('✓ Weight repository update() correctly triggered profile weight synchronization.');

    // Test user isolation on update
    const unauthorizedUpdate = await progressModule.weightRepo.update(logId, user2, { weightKg: 99.9 });
    if (unauthorizedUpdate !== null) {
      throw new Error('User isolation failure: user2 could update user1 weight log!');
    }
    console.log('✓ Weight repository update() strictly enforces user isolation.');

    // Test measurement update
    const initialMeas = await progressModule.measRepo.save(
      new (await import('../src/modules/progress/domain/body-measurement.js')).BodyMeasurement({
        id: crypto.randomUUID(),
        userId: user1,
        loggedAt: new Date('2026-11-01T10:00:00.000Z'),
        waistCm: 88.0,
        chestCm: 104.0,
      }),
    );
    const measId = initialMeas.measurement.id;

    const updatedMeas = await progressModule.measRepo.update(measId, user1, {
      waistCm: 86.5,
      chestCm: 105.0,
      notes: 'Adjusted tape fit',
    });
    if (!updatedMeas || updatedMeas.waistCm !== 86.5 || updatedMeas.chestCm !== 105.0) {
      throw new Error(`Measurement update failed: ${JSON.stringify(updatedMeas)}`);
    }

    const unauthorizedMeasUpdate = await progressModule.measRepo.update(measId, user2, { waistCm: 120.0 });
    if (unauthorizedMeasUpdate !== null) {
      throw new Error('User isolation failure: user2 could update user1 body measurement!');
    }
    console.log('✓ BodyMeasurement repository update() verified with user isolation.');

    // 2. Real HTTP Server & Endpoints Integration
    console.log('\n--- 2. Testing End-to-End Progress HTTP Endpoints ---');

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json());

    let activeUserId = user1;
    const authenticate: express.RequestHandler = (req, _res, next) => {
      req.actor = createActor({ userId: activeUserId, sessionId: 's1', role: 'member' });
      next();
    };

    app.use(progressModule.routes.basePath, buildRouter(progressModule.routes.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    // 2a. POST /weight with client-idempotency
    const clientUuid = crypto.randomUUID();
    const postRes1 = await request(app).post('/api/v1/progress/weight').send({
      weightKg: 83.5,
      loggedAt: '2026-11-03T09:00:00.000Z',
      source: 'manual',
      notes: 'Post workout',
      clientId: clientUuid,
    });

    if (postRes1.status !== 201 || !postRes1.body.success || postRes1.body.data.isNew !== true) {
      throw new Error(`POST /weight failed: ${JSON.stringify(postRes1.body)}`);
    }
    const httpWeightId = postRes1.body.data.log.id;
    console.log('✓ POST /api/v1/progress/weight returned 201 with standard envelope.');

    // 2b. Retry with identical clientId (Idempotent replay)
    const postRes2 = await request(app).post('/api/v1/progress/weight').send({
      weightKg: 83.5,
      clientId: clientUuid,
    });

    if (
      postRes2.status !== 201 ||
      postRes2.body.data.isNew !== false ||
      postRes2.body.data.log.id !== httpWeightId
    ) {
      throw new Error(`POST /weight idempotency failed: ${JSON.stringify(postRes2.body)}`);
    }
    console.log(
      '✓ POST /api/v1/progress/weight offline duplicate successfully returned existing record (isNew: false).',
    );

    // 2c. GET /weight history
    const getWeightRes = await request(app).get('/api/v1/progress/weight?range=W');
    if (
      getWeightRes.status !== 200 ||
      !getWeightRes.body.success ||
      !Array.isArray(getWeightRes.body.data.points)
    ) {
      throw new Error(`GET /weight failed: ${JSON.stringify(getWeightRes.body)}`);
    }
    console.log(
      `✓ GET /api/v1/progress/weight returned 200 with ${getWeightRes.body.data.points.length} EMA trend points.`,
    );

    // 2d. PUT /weight/:id
    const putWeightRes = await request(app).put(`/api/v1/progress/weight/${httpWeightId}`).send({
      weightKg: 83.2,
      notes: 'Updated note via HTTP PUT',
    });
    if (putWeightRes.status !== 200 || putWeightRes.body.data.weightKg !== 83.2) {
      throw new Error(`PUT /weight/:id failed: ${JSON.stringify(putWeightRes.body)}`);
    }
    console.log('✓ PUT /api/v1/progress/weight/:id updated record successfully.');

    // 2e. Cross-user isolation on update
    activeUserId = user2;
    const crossUpdateRes = await request(app)
      .put(`/api/v1/progress/weight/${httpWeightId}`)
      .send({ weightKg: 99.0 });
    if (crossUpdateRes.status !== 404) {
      throw new Error(`Cross-user isolation broken on HTTP: expected 404, got ${crossUpdateRes.status}`);
    }
    activeUserId = user1;
    console.log('✓ Cross-user update on HTTP returned 404 (user isolation verified).');

    // 2f. DELETE /weight/:id
    const deleteWeightRes = await request(app).delete(`/api/v1/progress/weight/${httpWeightId}`);
    if (deleteWeightRes.status !== 200 || deleteWeightRes.body.data.deleted !== true) {
      throw new Error(`DELETE /weight/:id failed: ${JSON.stringify(deleteWeightRes.body)}`);
    }
    console.log('✓ DELETE /api/v1/progress/weight/:id returned 200.');

    // 2g. POST /measurements
    const measClientUuid = crypto.randomUUID();
    const postMeasRes = await request(app).post('/api/v1/progress/measurements').send({
      waistCm: 85.0,
      chestCm: 104.5,
      bodyFatPct: 15.2,
      clientId: measClientUuid,
    });
    if (postMeasRes.status !== 201 || !postMeasRes.body.success) {
      throw new Error(`POST /measurements failed: ${JSON.stringify(postMeasRes.body)}`);
    }
    const httpMeasId = postMeasRes.body.data.measurement.id;
    console.log('✓ POST /api/v1/progress/measurements returned 201.');

    // 2h. GET /measurements
    const getMeasRes = await request(app).get('/api/v1/progress/measurements');
    if (getMeasRes.status !== 200 || !getMeasRes.body.success) {
      throw new Error(`GET /measurements failed: ${JSON.stringify(getMeasRes.body)}`);
    }
    console.log('✓ GET /api/v1/progress/measurements returned 200 with history & diffs.');

    // 2i. PUT /measurements/:id
    const putMeasRes = await request(app).put(`/api/v1/progress/measurements/${httpMeasId}`).send({
      waistCm: 84.8,
    });
    if (putMeasRes.status !== 200 || putMeasRes.body.data.waistCm !== 84.8) {
      throw new Error(`PUT /measurements/:id failed: ${JSON.stringify(putMeasRes.body)}`);
    }
    console.log('✓ PUT /api/v1/progress/measurements/:id returned 200.');

    // 2j. DELETE /measurements/:id
    const delMeasRes = await request(app).delete(`/api/v1/progress/measurements/${httpMeasId}`);
    if (delMeasRes.status !== 200 || delMeasRes.body.data.deleted !== true) {
      throw new Error(`DELETE /measurements/:id failed: ${JSON.stringify(delMeasRes.body)}`);
    }
    console.log('✓ DELETE /api/v1/progress/measurements/:id returned 200.');

    // 2k. GET /analytics
    const analyticsRes = await request(app).get('/api/v1/progress/analytics?metric=weight&range=M');
    if (analyticsRes.status !== 200 || analyticsRes.body.data.metric !== 'weight') {
      throw new Error(`GET /analytics failed: ${JSON.stringify(analyticsRes.body)}`);
    }
    console.log('✓ GET /api/v1/progress/analytics returned 200 with trend data.');

    // 2l. GET /analytics for unsupported device metric (steps/sleep)
    const stepsRes = await request(app).get('/api/v1/progress/analytics?metric=steps&range=W');
    if (
      stepsRes.status !== 200 ||
      stepsRes.body.data.hasDeviceData !== false ||
      stepsRes.body.data.points.length !== 0
    ) {
      throw new Error(`Device-dependent analytics failed: ${JSON.stringify(stepsRes.body)}`);
    }
    console.log(
      '✓ GET /api/v1/progress/analytics?metric=steps correctly returned hasDeviceData: false and empty series (no fake data).',
    );

    // 2m. GET /comparison
    const compRes = await request(app).get('/api/v1/progress/comparison?period=month');
    if (compRes.status !== 200 || !Array.isArray(compRes.body.data.comparisons)) {
      throw new Error(`GET /comparison failed: ${JSON.stringify(compRes.body)}`);
    }
    console.log(
      `✓ GET /api/v1/progress/comparison returned 200 (${compRes.body.data.comparisons.length} comparison rows).`,
    );

    // 2n. GET /achievements
    const achRes = await request(app).get('/api/v1/progress/achievements');
    if (achRes.status !== 200 || !Array.isArray(achRes.body.data.achievements)) {
      throw new Error(`GET /achievements failed: ${JSON.stringify(achRes.body)}`);
    }
    console.log(
      `✓ GET /api/v1/progress/achievements returned 200 (${achRes.body.data.achievements.length} achievements).`,
    );

    // 2o. GET /reports
    const reportRes = await request(app).get('/api/v1/progress/reports?type=weekly');
    if (
      reportRes.status !== 200 ||
      !reportRes.body.data.headline ||
      !Array.isArray(reportRes.body.data.stats)
    ) {
      throw new Error(`GET /reports failed: ${JSON.stringify(reportRes.body)}`);
    }
    console.log(`✓ GET /api/v1/progress/reports returned 200 (headline: "${reportRes.body.data.headline}").`);

    console.log('\n========================================================');
    console.log('🎉 ALL TASK 5.4 INTEGRATION VERIFICATIONS PASSED (15/15)!');
    console.log('========================================================\n');
  } finally {
    await pool.end();
    console.log('-> Stopping isolated PostgreSQL cluster...');
    execSync(`/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} stop -m immediate 2>/dev/null || true`);
    rmSync(PG_DIR, { recursive: true, force: true });
    console.log('✓ Cleanup completed.');
  }
}

main().catch((err) => {
  console.error('\n❌ Verification failed with error:', err);
  process.exit(1);
});
