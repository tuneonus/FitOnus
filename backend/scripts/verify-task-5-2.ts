import { execSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/database/migration-runner.js';
import { PgWeightRepository } from '../src/modules/progress/infrastructure/pg-weight-repository.js';
import { PgMeasurementRepository } from '../src/modules/progress/infrastructure/pg-measurement-repository.js';
import { WeightLog } from '../src/modules/progress/domain/weight-log.js';
import { BodyMeasurement } from '../src/modules/progress/domain/body-measurement.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PG_DIR = '/tmp/fitonus-test-pg-5-2';
const PG_PORT = 5434;
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

async function main() {
  console.log('=== FitOnus Task 5.2: Repository & Concurrency Verification ===');

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
  execSync(`/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} -o "-p ${PG_PORT} -k /tmp" -l ${PG_DIR}/server.log start`);

  const connectionString = `postgresql://localhost:${PG_PORT}/postgres?host=/tmp`;
  const pool = new pg.Pool({ connectionString });

  try {
    console.log('-> Applying migrations 0001 -> 0009...');
    await runMigrations({ pool, directory: MIGRATIONS_DIR });

    const weightRepo = new PgWeightRepository(pool);
    const measRepo = new PgMeasurementRepository(pool);

    const user1 = '11111111-2222-4333-8444-555555555555';
    const user2 = '99999999-8888-4777-8666-555555555555';

    await pool.query(`
      INSERT INTO users (id, email, display_name, password_hash, role) VALUES 
      ($1, 'user1@test.com', 'User 1', 'hash1', 'member'),
      ($2, 'user2@test.com', 'User 2', 'hash2', 'member');
    `, [user1, user2]);

    await pool.query(`
      INSERT INTO user_profiles (user_id, height_cm, current_weight_kg, starting_weight_kg, target_weight_kg)
      VALUES ($1::uuid, 178.0, 80.0, 80.0, 72.0), ($2::uuid, 165.0, 62.0, 62.0, 58.0);
    `, [user1, user2]);

    console.log('✓ Seeded users and baseline profiles.');

    // 1. Weight repository save & read
    console.log('-> 1. Testing WeightRepository save and findById...');
    const log1 = new WeightLog({
      id: 'a0000001-0000-4000-8000-000000000001',
      userId: user1,
      weightKg: 79.5,
      loggedAt: new Date('2026-10-01T08:00:00Z'),
      notes: 'Initial test log',
      clientId: 'client-w-1',
    });

    const saveRes1 = await weightRepo.save(log1);
    if (!saveRes1.isNew || saveRes1.log.weightKg !== 79.5) {
      throw new Error(`Failed to save log1: ${JSON.stringify(saveRes1)}`);
    }

    const fetchedLog1 = await weightRepo.findById(log1.id, user1);
    if (!fetchedLog1 || fetchedLog1.weightKg !== 79.5) {
      throw new Error('Failed to find log1 by ID');
    }
    console.log('✓ WeightRepository save & findById successful.');

    // 2. Duplicate Client ID Idempotency
    console.log('-> 2. Testing duplicate client ID idempotency...');
    const duplicateLog = new WeightLog({
      id: 'a0000002-0000-4000-8000-000000000002', // different PK, but same clientId
      userId: user1,
      weightKg: 99.9, // different weight
      loggedAt: new Date('2026-10-01T08:00:00Z'),
      clientId: 'client-w-1', // duplicate
    });

    const dupRes = await weightRepo.save(duplicateLog);
    if (dupRes.isNew !== false || dupRes.log.id !== log1.id || dupRes.log.weightKg !== 79.5) {
      throw new Error(`Idempotency failed: Expected existing log1 to be returned. Got: ${JSON.stringify(dupRes)}`);
    }
    console.log('✓ Idempotency verified: Duplicate client ID returned original record without creating duplicate.');

    // 3. User Isolation
    console.log('-> 3. Testing user isolation on findById and findByClientId...');
    const foreignFind = await weightRepo.findById(log1.id, user2);
    if (foreignFind !== null) {
      throw new Error('User isolation broken: User 2 could read User 1 log!');
    }
    const foreignClientFind = await weightRepo.findByClientId('client-w-1', user2);
    if (foreignClientFind !== null) {
      throw new Error('User isolation broken: User 2 could read User 1 log by clientId!');
    }
    console.log('✓ User isolation strictly enforced on WeightRepository.');

    // 4. Backdated Entry and Listing/Pagination
    console.log('-> 4. Testing multiple entries, backdated insert, and pagination...');
    const log2 = new WeightLog({
      id: 'a0000003-0000-4000-8000-000000000003',
      userId: user1,
      weightKg: 79.0,
      loggedAt: new Date('2026-10-05T08:00:00Z'),
      clientId: 'client-w-2',
    });
    const log3Backdated = new WeightLog({
      id: 'a0000004-0000-4000-8000-000000000004',
      userId: user1,
      weightKg: 79.2,
      loggedAt: new Date('2026-10-03T08:00:00Z'), // backdated
      clientId: 'client-w-3',
    });
    await weightRepo.save(log2);
    await weightRepo.save(log3Backdated);

    const listAll = await weightRepo.listForUser(user1);
    if (listAll.total !== 3 || listAll.logs.length !== 3) {
      throw new Error(`Expected 3 logs, got total ${listAll.total}`);
    }
    // Verify descending sort order by loggedAt: Oct 5 (79.0), Oct 3 (79.2), Oct 1 (79.5)
    if (listAll.logs[0]?.weightKg !== 79.0 || listAll.logs[1]?.weightKg !== 79.2 || listAll.logs[2]?.weightKg !== 79.5) {
      throw new Error('Logs are not sorted in descending chronological order!');
    }

    // Pagination test: offset 1, limit 1
    const paged = await weightRepo.listForUser(user1, { offset: 1, limit: 1 });
    if (paged.total !== 3 || paged.logs.length !== 1 || paged.logs[0]?.weightKg !== 79.2) {
      throw new Error(`Pagination failed: ${JSON.stringify(paged)}`);
    }

    // Date range filter: between Oct 2 and Oct 4
    const ranged = await weightRepo.listForUser(user1, {
      startDate: new Date('2026-10-02T00:00:00Z'),
      endDate: new Date('2026-10-04T00:00:00Z'),
    });
    if (ranged.total !== 1 || ranged.logs[0]?.weightKg !== 79.2) {
      throw new Error(`Date range filtering failed: ${JSON.stringify(ranged)}`);
    }
    console.log('✓ Listing, sorting, date-range filtering, and pagination verified.');

    // 5. Earliest, Latest, and Summary
    console.log('-> 5. Testing getLatestForUser, getEarliestForUser, and getUserWeightSummary...');
    const latest = await weightRepo.getLatestForUser(user1);
    const earliest = await weightRepo.getEarliestForUser(user1);
    if (latest?.weightKg !== 79.0 || earliest?.weightKg !== 79.5) {
      throw new Error(`Latest/earliest error: latest=${latest?.weightKg}, earliest=${earliest?.weightKg}`);
    }

    const summary = await weightRepo.getUserWeightSummary(user1);
    if (summary.currentWeightKg !== 79.0 || summary.startingWeightKg !== 80.0 || summary.totalLogsCount !== 3) {
      throw new Error(`Summary error: ${JSON.stringify(summary)}`);
    }
    console.log('✓ Summary verified: current=79.0, starting=80.0, totalCount=3.');

    // 6. Soft Delete and Rollback
    console.log('-> 6. Testing softDelete on latest entry and profile rollback...');
    const softDeleted = await weightRepo.softDelete(log2.id, user1);
    if (!softDeleted) throw new Error('Failed to soft delete log2');

    const summaryAfterDelete = await weightRepo.getUserWeightSummary(user1);
    if (summaryAfterDelete.currentWeightKg !== 79.2 || summaryAfterDelete.totalLogsCount !== 2) {
      throw new Error(`Profile rollback failed: ${JSON.stringify(summaryAfterDelete)}`);
    }
    console.log('✓ Soft delete rolled back profile current weight to 79.2.');

    // 7. Body Measurements Repository
    console.log('-> 7. Testing BodyMeasurementRepository save, find, and list...');
    const meas1 = new BodyMeasurement({
      id: 'b0000001-0000-4000-8000-000000000001',
      userId: user1,
      loggedAt: new Date('2026-10-02T08:00:00Z'),
      waistCm: 84.0,
      chestCm: 102.5,
      bodyFatPct: 16.2,
      clientId: 'client-m-1',
    });

    const measSave1 = await measRepo.save(meas1);
    if (!measSave1.isNew || measSave1.measurement.waistCm !== 84.0) {
      throw new Error('Failed to save meas1');
    }

    const fetchedMeas1 = await measRepo.findById(meas1.id, user1);
    if (!fetchedMeas1 || fetchedMeas1.waistCm !== 84.0 || fetchedMeas1.chestCm !== 102.5) {
      throw new Error('Failed to find measurement by ID');
    }

    // User isolation on measurement
    const foreignMeas = await measRepo.findById(meas1.id, user2);
    if (foreignMeas !== null) throw new Error('User isolation broken on measurements');

    // Duplicate client ID on measurement
    const dupMeas = new BodyMeasurement({
      id: 'b0000002-0000-4000-8000-000000000002',
      userId: user1,
      loggedAt: new Date('2026-10-02T08:00:00Z'),
      waistCm: 90.0,
      clientId: 'client-m-1',
    });
    const dupMeasRes = await measRepo.save(dupMeas);
    if (dupMeasRes.isNew !== false || dupMeasRes.measurement.waistCm !== 84.0) {
      throw new Error('Measurement idempotency failed');
    }
    console.log('✓ BodyMeasurementRepository verified with idempotency and user isolation.');

    // 8. Concurrent writes via repository
    console.log('-> 8. Testing parallel concurrent repository writes...');
    const concPromises = Array.from({ length: 6 }).map((_, i) => {
      const log = new WeightLog({
        id: `c000000${i}-0000-4000-8000-00000000000${i}`,
        userId: user1,
        weightKg: 78.0 + (i * 0.1),
        loggedAt: new Date(`2026-10-1${i}T08:00:00Z`),
        clientId: `client-conc-${i}`,
      });
      return weightRepo.save(log);
    });

    const concResults = await Promise.all(concPromises);
    if (concResults.length !== 6 || !concResults.every(r => r.isNew)) {
      throw new Error('Concurrent writes failed to all complete successfully');
    }

    const finalSummary = await weightRepo.getUserWeightSummary(user1);
    // The latest logged entry was for 2026-10-15 (i = 5), which is 78.0 + 0.5 = 78.5 kg
    if (finalSummary.currentWeightKg !== 78.5) {
      throw new Error(`Concurrent execution left profile in inconsistent state! Expected 78.5, got ${finalSummary.currentWeightKg}`);
    }
    console.log('✓ Concurrent repository writes completed safely without deadlocks.');

    console.log('\n======================================================');
    console.log('ALL TASK 5.2 REPOSITORY VERIFICATION CHECKS PASSED!');
    console.log('======================================================');

  } finally {
    await pool.end();
    console.log('-> Stopping and cleaning up isolated PostgreSQL cluster...');
    execSync(`/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} stop -m immediate 2>/dev/null || true`);
    rmSync(PG_DIR, { recursive: true, force: true });
    console.log('✓ Cleanup complete.');
  }
}

main().catch((err) => {
  console.error('\n❌ REPOSITORY VERIFICATION FAILED:', err);
  process.exit(1);
});
