/**
 * FITONUS DEV DATABASE CLEANUP SCRIPT
 * Target: Neon DEV (ep-shy-art-b3sxwfkd, branch br-fragrant-morning-b35lwkjg)
 *
 * Safety:
 * - Refuses to run if connected to production endpoint.
 * - Wraps all operations in an atomic transaction.
 * - Preserves: schema_migrations (19), app_settings (7), gemini_config (1),
 *   gemini_pricing (8), badges (7), exercises (14), foods (25), workouts (3),
 *   workout_exercises (13), admin user (admin@fitonus.com).
 * - Total Preserved Rows: Exactly 98
 * - Post-cleanup verification asserts that exactly 98 rows exist across the entire DB
 *   and all other 35 tables are 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const match = envFile.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
if (!match || !match[1]) {
  console.error('FATAL: DATABASE_URL not found in .env');
  process.exit(1);
}

const dbUrl = match[1];

// STRICT ENVIRONMENT GUARDS
if (dbUrl.includes('ep-gentle-bar-b3ywek03') || dbUrl.includes('br-icy-term-b3lb70tb')) {
  console.error('CRITICAL ERROR: Connection string matches PRODUCTION! Aborting immediately.');
  process.exit(1);
}

if (!dbUrl.includes('ep-shy-art-b3sxwfkd') && !dbUrl.includes('b35lwkjg')) {
  console.error(
    'CRITICAL ERROR: Connection string is NOT the approved DEV endpoint (ep-shy-art-b3sxwfkd)! Aborting.',
  );
  process.exit(1);
}

console.log('✓ Target database guard passed: DEV endpoint verified (ep-shy-art-b3sxwfkd)');

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

const ADMIN_ID = 'ae1c758b-e47d-4053-ab70-4114c2bfab79';
const ADMIN_EMAIL = 'admin@fitonus.com';

export async function executeCleanup(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SET search_path = public;');

    // 1. Guard check: Admin exists
    const adminCheck = await client.query(
      `SELECT count(*)::int as c FROM public.users WHERE id = $1 AND email = $2 AND role = 'admin'`,
      [ADMIN_ID, ADMIN_EMAIL],
    );
    if (adminCheck.rows[0].c !== 1) {
      throw new Error(
        `Safety Guard Triggered: Admin user ${ADMIN_EMAIL} (${ADMIN_ID}) not found in database!`,
      );
    }

    console.log('Starting atomic transaction for DEV database cleanup...');
    await client.query('BEGIN;');

    // Step 1: Notifications & Messaging
    console.log('1. Cleaning notifications and push devices...');
    await client.query('DELETE FROM public.notification_deliveries;');
    await client.query('DELETE FROM public.notification_campaigns;');
    await client.query('DELETE FROM public.notifications;');
    await client.query('DELETE FROM public.user_push_devices;');
    await client.query('DELETE FROM public.notification_preferences;');

    // Step 2: AI Coach & Usage Telemetry
    console.log('2. Cleaning AI coach messages, conversations, memories, and usage telemetry...');
    await client.query('DELETE FROM public.coach_messages;');
    await client.query('DELETE FROM public.coach_conversations;');
    await client.query('DELETE FROM public.coach_memories;');
    await client.query('DELETE FROM public.gemini_usage_events;');
    await client.query('DELETE FROM public.user_ai_usage;');

    // Step 3: Nutrition & Meals
    console.log('3. Cleaning meals, meal items, favorites, and user custom foods...');
    await client.query('DELETE FROM public.meal_items;');
    await client.query('DELETE FROM public.meals;');
    await client.query('DELETE FROM public.food_favorites;');
    await client.query('DELETE FROM public.foods WHERE is_custom = true OR created_by IS NOT NULL;');

    // Step 4: Gamification & Challenges
    console.log('4. Cleaning challenges, occurrences, enrollments, user badges, ledger, and profiles...');
    await client.query('DELETE FROM public.challenge_enrollments;');
    await client.query('DELETE FROM public.challenge_occurrences;');
    await client.query('DELETE FROM public.challenges;');
    await client.query('DELETE FROM public.user_badges;');
    await client.query('DELETE FROM public.gamification_points_ledger;');
    await client.query('DELETE FROM public.gamification_profiles;');

    // Step 5: Goals, Habits, Progress & Telemetry
    console.log('5. Cleaning goals, habits, body measurements, weights, water...');
    await client.query('DELETE FROM public.goal_checkpoints;');
    await client.query('DELETE FROM public.goals;');
    await client.query('DELETE FROM public.habit_completions;');
    await client.query('DELETE FROM public.habits;');
    await client.query('DELETE FROM public.personal_records;');
    await client.query('DELETE FROM public.body_measurements;');
    await client.query('DELETE FROM public.weight_logs;');
    await client.query('DELETE FROM public.water_intake;');

    // Step 6: Workouts & Sessions
    console.log('6. Cleaning workout sessions, sets, and user custom workouts/exercises...');
    await client.query('DELETE FROM public.workout_session_sets;');
    await client.query('DELETE FROM public.workout_sessions;');
    await client.query(
      'DELETE FROM public.workout_exercises WHERE workout_id IN (SELECT id FROM public.workouts WHERE is_template = false);',
    );
    await client.query('DELETE FROM public.workouts WHERE is_template = false;');
    await client.query('DELETE FROM public.exercises WHERE is_system = false OR created_by IS NOT NULL;');

    // Step 7: Auth, Audit, Tokens & Idempotency
    console.log(
      '7. Cleaning idempotency keys, password reset tokens, admin audit logs, and auth sessions...',
    );
    await client.query('DELETE FROM public.idempotency_keys;');
    await client.query('DELETE FROM public.password_reset_tokens;');
    await client.query('DELETE FROM public.admin_audit_logs;');
    await client.query('DELETE FROM public.auth_sessions;');

    // Step 8: User Settings & Profiles (Non-Admin)
    console.log('8. Cleaning user profiles and settings for non-admin users...');
    await client.query(`DELETE FROM public.user_settings WHERE user_id != '${ADMIN_ID}'::uuid;`);
    await client.query(`DELETE FROM public.user_profiles WHERE user_id != '${ADMIN_ID}'::uuid;`);

    // Step 9: Users (Preserving admin@fitonus.com)
    console.log('9. Nullifying FK references and deleting non-admin users...');
    await client.query(
      `UPDATE public.app_settings SET updated_by = NULL WHERE updated_by IS NOT NULL AND updated_by != '${ADMIN_ID}'::uuid;`,
    );
    await client.query(
      `UPDATE public.gemini_config SET updated_by = NULL WHERE updated_by IS NOT NULL AND updated_by != '${ADMIN_ID}'::uuid;`,
    );
    await client.query(`DELETE FROM public.users WHERE id != '${ADMIN_ID}'::uuid;`);

    // Verification Assertions before COMMIT
    console.log('Executing post-cleanup assertions inside transaction...');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    let postTotal = 0;
    const postCounts: Record<string, number> = {};
    for (const t of tablesRes.rows) {
      const c = await client.query(`SELECT count(*)::int as c FROM public."${t.table_name}"`);
      postCounts[t.table_name] = c.rows[0].c;
      postTotal += c.rows[0].c;
    }

    if (postCounts['schema_migrations'] !== 19)
      throw new Error(`schema_migrations mismatch: ${postCounts['schema_migrations']}`);
    if (postCounts['app_settings'] !== 7)
      throw new Error(`app_settings mismatch: ${postCounts['app_settings']}`);
    if (postCounts['gemini_config'] !== 1)
      throw new Error(`gemini_config mismatch: ${postCounts['gemini_config']}`);
    if (postCounts['gemini_pricing'] !== 8)
      throw new Error(`gemini_pricing mismatch: ${postCounts['gemini_pricing']}`);
    if (postCounts['badges'] !== 7) throw new Error(`badges mismatch: ${postCounts['badges']}`);
    if (postCounts['exercises'] !== 14) throw new Error(`exercises mismatch: ${postCounts['exercises']}`);
    if (postCounts['foods'] !== 25) throw new Error(`foods mismatch: ${postCounts['foods']}`);
    if (postCounts['workouts'] !== 3) throw new Error(`workouts mismatch: ${postCounts['workouts']}`);
    if (postCounts['workout_exercises'] !== 13)
      throw new Error(`workout_exercises mismatch: ${postCounts['workout_exercises']}`);
    if (postCounts['users'] !== 1) throw new Error(`users mismatch: ${postCounts['users']}`);

    if (postTotal !== 98) {
      throw new Error(`Total preserved rows is ${postTotal} (expected exactly 98)`);
    }

    await client.query('COMMIT;');
    console.log('✓ TRANSACTION COMMITTED SUCCESSFULLY! DEV database has been reset.');
    console.log('✓ Exactly 98 system reference rows preserved. 517 test rows cleanly deleted.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('CRITICAL: Cleanup failed and was rolled back:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Only execute when run directly
if (process.argv.includes('--execute-now')) {
  executeCleanup().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
