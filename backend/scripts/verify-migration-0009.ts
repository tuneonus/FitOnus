import { execSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../src/database/migration-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PG_DIR = '/tmp/fitonus-test-pg-5-1';
const PG_PORT = 5433;
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

async function main() {
  console.log('=== FitOnus Task 5.1: Local Isolated PostgreSQL Verification ===');

  // 1. Clean previous run if any
  try {
    execSync(`/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} stop -m immediate 2>/dev/null || true`);
    rmSync(PG_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }

  mkdirSync(PG_DIR, { recursive: true });

  // 2. Initialize ephemeral cluster
  console.log('-> Initializing ephemeral PostgreSQL 16 cluster...');
  execSync(`/usr/lib/postgresql/16/bin/initdb -D ${PG_DIR} --no-locale -E UTF8 > /dev/null`);

  // 3. Start PostgreSQL on custom port 5433
  console.log(`-> Starting isolated PostgreSQL on port ${PG_PORT}...`);
  execSync(
    `/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} -o "-p ${PG_PORT} -k /tmp" -l ${PG_DIR}/server.log start`,
  );

  const connectionString = `postgresql://localhost:${PG_PORT}/postgres?host=/tmp`;
  const pool = new pg.Pool({ connectionString });

  try {
    // 4. Test connection
    const ping = await pool.query('SELECT version()');
    console.log(`✓ Connected to isolated PostgreSQL: ${ping.rows[0].version.split(' ')[1]}`);

    // 5. Run all migrations 0001 -> 0009
    console.log('-> Executing migrations 0001 through 0009...');
    const migrationResult = await runMigrations({ pool, directory: MIGRATIONS_DIR });
    console.log(
      `✓ Applied ${migrationResult.applied.length} migrations: ${migrationResult.applied.join(', ')}`,
    );

    // 6. Verify table existence
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tableNames = tablesRes.rows.map((r) => r.table_name);
    console.log(`✓ Public tables verified: ${tableNames.join(', ')}`);
    if (!tableNames.includes('weight_logs') || !tableNames.includes('body_measurements')) {
      throw new Error('Missing weight_logs or body_measurements in migrated schema!');
    }

    // 7. Setup Test Users
    console.log('-> Setting up test users and profiles...');
    const userA = '11111111-1111-4111-8111-111111111111';
    const userB = '22222222-2222-4222-8222-222222222222';

    await pool.query(
      `
      INSERT INTO users (id, email, display_name, password_hash, role) VALUES 
      ($1, 'usera@example.com', 'User A', 'dummy_hash_a', 'member'),
      ($2, 'userb@example.com', 'User B', 'dummy_hash_b', 'member')
    `,
      [userA, userB],
    );

    await pool.query(
      `
      INSERT INTO user_profiles (user_id, height_cm, current_weight_kg, starting_weight_kg, target_weight_kg)
      VALUES ($1::uuid, 180.0, 85.0, 85.0, 75.0)
    `,
      [userA],
    );

    await pool.query(
      `
      INSERT INTO user_profiles (user_id, height_cm, current_weight_kg, starting_weight_kg, target_weight_kg)
      VALUES ($1::uuid, 175.0, 70.0, 70.0, 65.0)
    `,
      [userB],
    );

    console.log(
      '✓ Initial profiles seeded: User A (current=85.0, starting=85.0), User B (current=70.0, starting=70.0)',
    );

    // 8. Test 1: Weight insert updates current_weight_kg
    console.log('-> Test 1: Weight insert updates current_weight_kg...');
    const log1Id = 'aaaa0001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await pool.query(
      `
      INSERT INTO weight_logs (id, user_id, weight_kg, logged_at, source, client_id)
      VALUES ($1, $2, 84.2, '2026-10-01T08:00:00Z', 'manual', 'client-log-1')
    `,
      [log1Id, userA],
    );

    const profAfterLog1 = await pool.query(
      'SELECT current_weight_kg, starting_weight_kg FROM user_profiles WHERE user_id = $1',
      [userA],
    );
    console.log(
      `  User A profile: current=${profAfterLog1.rows[0].current_weight_kg}, starting=${profAfterLog1.rows[0].starting_weight_kg}`,
    );
    if (
      Number(profAfterLog1.rows[0].current_weight_kg) !== 84.2 ||
      Number(profAfterLog1.rows[0].starting_weight_kg) !== 85.0
    ) {
      throw new Error(
        `Test 1 Failed: Expected current 84.2, starting 85.0. Got: ${JSON.stringify(profAfterLog1.rows[0])}`,
      );
    }
    console.log('✓ Test 1 Passed: current_weight_kg updated to 84.2, starting_weight_kg preserved at 85.0.');

    // 9. Test 2: Newer weight entry advances current_weight_kg
    console.log('-> Test 2: Newer weight entry advances current_weight_kg...');
    const log2Id = 'aaaa0002-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await pool.query(
      `
      INSERT INTO weight_logs (id, user_id, weight_kg, logged_at, source, client_id)
      VALUES ($1, $2, 83.5, '2026-10-05T08:00:00Z', 'manual', 'client-log-2')
    `,
      [log2Id, userA],
    );

    const profAfterLog2 = await pool.query(
      'SELECT current_weight_kg, starting_weight_kg FROM user_profiles WHERE user_id = $1',
      [userA],
    );
    console.log(
      `  User A profile: current=${profAfterLog2.rows[0].current_weight_kg}, starting=${profAfterLog2.rows[0].starting_weight_kg}`,
    );
    if (Number(profAfterLog2.rows[0].current_weight_kg) !== 83.5) {
      throw new Error(`Test 2 Failed: Expected current 83.5`);
    }
    console.log('✓ Test 2 Passed: current_weight_kg advanced to 83.5.');

    // 10. Test 3: Backdated insert does NOT overwrite current_weight_kg
    console.log('-> Test 3: Backdated insert (Oct 3) does NOT overwrite current_weight_kg (Oct 5)...');
    const log3BackdatedId = 'aaaa0003-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await pool.query(
      `
      INSERT INTO weight_logs (id, user_id, weight_kg, logged_at, source, client_id)
      VALUES ($1, $2, 83.9, '2026-10-03T08:00:00Z', 'manual', 'client-log-3')
    `,
      [log3BackdatedId, userA],
    );

    const profAfterBackdated = await pool.query(
      'SELECT current_weight_kg, starting_weight_kg FROM user_profiles WHERE user_id = $1',
      [userA],
    );
    console.log(`  User A profile: current=${profAfterBackdated.rows[0].current_weight_kg}`);
    if (Number(profAfterBackdated.rows[0].current_weight_kg) !== 83.5) {
      throw new Error(
        `Test 3 Failed: Backdated entry corrupted current_weight_kg! Expected 83.5, got ${profAfterBackdated.rows[0].current_weight_kg}`,
      );
    }
    console.log('✓ Test 3 Passed: Backdated insert preserved latest reading 83.5.');

    // 11. Test 4: Latest entry deletion rolls back current_weight_kg to prior entry
    console.log(
      '-> Test 4: Deleting latest entry (Oct 5: 83.5) rolls back current_weight_kg to Oct 3 (83.9)...',
    );
    await pool.query('DELETE FROM weight_logs WHERE id = $1', [log2Id]);

    const profAfterDelete = await pool.query(
      'SELECT current_weight_kg, starting_weight_kg FROM user_profiles WHERE user_id = $1',
      [userA],
    );
    console.log(`  User A profile after delete: current=${profAfterDelete.rows[0].current_weight_kg}`);
    if (Number(profAfterDelete.rows[0].current_weight_kg) !== 83.9) {
      throw new Error(
        `Test 4 Failed: Expected rollback to 83.9, got ${profAfterDelete.rows[0].current_weight_kg}`,
      );
    }
    console.log(
      '✓ Test 4 Passed: Deleting newest entry rolled back current_weight_kg to previous active entry.',
    );

    // 12. Test 5: Soft delete also triggers rollback
    console.log('-> Test 5: Soft-deleting Oct 3 entry rolls back to Oct 1 (84.2)...');
    await pool.query('UPDATE weight_logs SET deleted_at = NOW() WHERE id = $1', [log3BackdatedId]);
    const profAfterSoftDelete = await pool.query(
      'SELECT current_weight_kg, starting_weight_kg FROM user_profiles WHERE user_id = $1',
      [userA],
    );
    console.log(
      `  User A profile after soft-delete: current=${profAfterSoftDelete.rows[0].current_weight_kg}`,
    );
    if (Number(profAfterSoftDelete.rows[0].current_weight_kg) !== 84.2) {
      throw new Error(`Test 5 Failed: Expected 84.2, got ${profAfterSoftDelete.rows[0].current_weight_kg}`);
    }
    console.log('✓ Test 5 Passed: Soft delete correctly rolled back current_weight_kg.');

    // 13. Test 6: Deleting all entries safely falls back to starting_weight_kg
    console.log('-> Test 6: Deleting all entries falls back to starting_weight_kg (85.0)...');
    await pool.query('DELETE FROM weight_logs WHERE user_id = $1', [userA]);
    const profAfterAllDeleted = await pool.query(
      'SELECT current_weight_kg, starting_weight_kg FROM user_profiles WHERE user_id = $1',
      [userA],
    );
    console.log(
      `  User A profile: current=${profAfterAllDeleted.rows[0].current_weight_kg}, starting=${profAfterAllDeleted.rows[0].starting_weight_kg}`,
    );
    if (
      Number(profAfterAllDeleted.rows[0].current_weight_kg) !== 85.0 ||
      Number(profAfterAllDeleted.rows[0].starting_weight_kg) !== 85.0
    ) {
      throw new Error(`Test 6 Failed: Expected current and starting 85.0`);
    }
    console.log('✓ Test 6 Passed: Complete deletion safely preserved baseline starting_weight_kg.');

    // 14. Test 7: Duplicate offline submission with same client_id
    console.log('-> Test 7: Duplicate offline submission with same client_id...');
    await pool.query(
      `
      INSERT INTO weight_logs (user_id, weight_kg, logged_at, client_id)
      VALUES ($1, 82.5, '2026-10-10T08:00:00Z', 'offline-uuid-999')
    `,
      [userA],
    );

    // Replay submission with ON CONFLICT DO NOTHING
    const replayRes = await pool.query(
      `
      INSERT INTO weight_logs (user_id, weight_kg, logged_at, client_id)
      VALUES ($1, 82.5, '2026-10-10T08:00:00Z', 'offline-uuid-999')
      ON CONFLICT (user_id, client_id) DO NOTHING
      RETURNING id;
    `,
      [userA],
    );

    console.log(`  Replay row count returned: ${replayRes.rowCount}`);
    const countLogs = await pool.query('SELECT count(*) FROM weight_logs WHERE client_id = $1', [
      'offline-uuid-999',
    ]);
    if (Number(countLogs.rows[0].count) !== 1) {
      throw new Error(`Test 7 Failed: Duplicate row created! Count: ${countLogs.rows[0].count}`);
    }
    console.log('✓ Test 7 Passed: Offline idempotency constraint prevented duplicate insertion.');

    // 15. Test 8: User Isolation
    console.log('-> Test 8: User isolation (User A vs User B)...');
    const userBProf = await pool.query(
      'SELECT current_weight_kg, starting_weight_kg FROM user_profiles WHERE user_id = $1',
      [userB],
    );
    if (
      Number(userBProf.rows[0].current_weight_kg) !== 70.0 ||
      Number(userBProf.rows[0].starting_weight_kg) !== 70.0
    ) {
      throw new Error(`Test 8 Failed: User B profile mutated by User A operations!`);
    }
    console.log('✓ Test 8 Passed: User B was 100% isolated and untouched.');

    // 16. Test 9: Concurrent Inserts Simulation
    console.log('-> Test 9: Concurrent inserts serialization via row-level lock...');
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      await client1.query('BEGIN');
      await client2.query('BEGIN');

      // Thread 1 inserts an entry for 2026-10-12
      await client1.query(
        `
        INSERT INTO weight_logs (user_id, weight_kg, logged_at, client_id)
        VALUES ($1, 81.0, '2026-10-12T08:00:00Z', 'conc-1')
      `,
        [userA],
      );

      // Thread 2 inserts an entry for 2026-10-11 (runs concurrently, waits on profile lock)
      const thread2Promise = client2.query(
        `
        INSERT INTO weight_logs (user_id, weight_kg, logged_at, client_id)
        VALUES ($1, 81.5, '2026-10-11T08:00:00Z', 'conc-2')
      `,
        [userA],
      );

      // Commit Thread 1
      await client1.query('COMMIT');

      // Now Thread 2 unblocks and executes
      await thread2Promise;
      await client2.query('COMMIT');

      // Check final weight: 2026-10-12 (81.0) is newer than 2026-10-11 (81.5), so current should be 81.0
      const profAfterConcurrent = await pool.query(
        'SELECT current_weight_kg FROM user_profiles WHERE user_id = $1',
        [userA],
      );
      console.log(
        `  User A profile after concurrent commits: current=${profAfterConcurrent.rows[0].current_weight_kg}`,
      );
      if (Number(profAfterConcurrent.rows[0].current_weight_kg) !== 81.0) {
        throw new Error(
          `Test 9 Failed: Race condition! Expected 81.0, got ${profAfterConcurrent.rows[0].current_weight_kg}`,
        );
      }
      console.log('✓ Test 9 Passed: Concurrent inserts serialized safely with zero anomalies.');
    } finally {
      client1.release();
      client2.release();
    }

    // 17. Test 10: Body Measurements Constraints
    console.log('-> Test 10: Body measurements constraints & validation...');
    // Should fail when all measurements are NULL
    try {
      await pool.query(
        `
        INSERT INTO body_measurements (user_id, logged_at)
        VALUES ($1, NOW())
      `,
        [userA],
      );
      throw new Error('Expected failure on all-NULL measurements, but succeeded!');
    } catch (err: any) {
      if (!err.message.includes('chk_at_least_one_measurement')) {
        throw err;
      }
      console.log('  chk_at_least_one_measurement constraint successfully caught empty payload.');
    }

    // Should succeed with valid measurement
    await pool.query(
      `
      INSERT INTO body_measurements (user_id, logged_at, waist_cm, chest_cm, body_fat_pct, client_id)
      VALUES ($1, NOW(), 82.5, 102.0, 15.5, 'meas-client-1')
    `,
      [userA],
    );

    const measRes = await pool.query(
      'SELECT waist_cm, chest_cm, body_fat_pct FROM body_measurements WHERE client_id = $1',
      ['meas-client-1'],
    );
    console.log(
      `  Saved measurement: waist=${measRes.rows[0].waist_cm}, chest=${measRes.rows[0].chest_cm}, body_fat=${measRes.rows[0].body_fat_pct}%`,
    );
    console.log('✓ Test 10 Passed: Body measurements constraints and insert verified.');

    console.log('\n======================================================');
    console.log('ALL TASK 5.1 VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
    console.log('======================================================');
  } finally {
    await pool.end();
    // Stop and cleanup ephemeral PostgreSQL cluster
    console.log('-> Shutting down and cleaning up isolated PostgreSQL cluster...');
    execSync(`/usr/lib/postgresql/16/bin/pg_ctl -D ${PG_DIR} stop -m immediate 2>/dev/null || true`);
    rmSync(PG_DIR, { recursive: true, force: true });
    console.log('✓ Cleanup complete.');
  }
}

main().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
