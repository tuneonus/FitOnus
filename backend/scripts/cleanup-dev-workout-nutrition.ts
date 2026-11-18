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

// 1. STRICT ENVIRONMENT GUARDS
if (dbUrl.includes('ep-gentle-bar-b3ywek03') || dbUrl.includes('br-icy-term-b3lb70tb')) {
  console.error('CRITICAL ERROR: Connection string matches PRODUCTION! Aborting immediately.');
  process.exit(1);
}

if (!dbUrl.includes('ep-shy-art-b3sxwfkd') && !dbUrl.includes('b35lwkjg')) {
  console.error('CRITICAL ERROR: Connection string is NOT the approved DEV endpoint (ep-shy-art-b3sxwfkd)! Aborting.');
  process.exit(1);
}

console.log('✓ Safety Guard Passed: Confirmed DEV endpoint (ep-shy-art-b3sxwfkd, branch br-fragrant-morning-b35lwkjg)');

// 2. VERIFY BACKUP AVAILABILITY
const backupDir = path.resolve(process.cwd(), 'backups/dev-reset-backup-20261114');
const backupSql = path.join(backupDir, 'restore_data.sql');
const backupJson = path.join(backupDir, 'database_dump.json');
const backupReport = path.join(backupDir, 'verification_report.json');

if (!fs.existsSync(backupSql) || !fs.existsSync(backupJson) || !fs.existsSync(backupReport)) {
  console.error('CRITICAL ERROR: Verified backup not found in backups/dev-reset-backup-20261114! Aborting.');
  process.exit(1);
}

console.log('✓ Safety Guard Passed: Verified backup files exist and are available for restore.');

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path = public;');

    // Pre-cleanup counts
    const preWorkouts = (await client.query('SELECT count(*)::int as c FROM public.workouts')).rows[0].c;
    const preWorkoutExercises = (await client.query('SELECT count(*)::int as c FROM public.workout_exercises')).rows[0].c;
    const preExercises = (await client.query('SELECT count(*)::int as c FROM public.exercises')).rows[0].c;
    const preFoods = (await client.query('SELECT count(*)::int as c FROM public.foods')).rows[0].c;
    const preMeals = (await client.query('SELECT count(*)::int as c FROM public.meals')).rows[0].c;
    const preMealItems = (await client.query('SELECT count(*)::int as c FROM public.meal_items')).rows[0].c;
    const preFavorites = (await client.query('SELECT count(*)::int as c FROM public.food_favorites')).rows[0].c;

    console.log('\n--- PRE-CLEANUP TARGET ROW COUNTS ---');
    console.log({
      workouts: preWorkouts,
      workout_exercises: preWorkoutExercises,
      exercises: preExercises,
      foods: preFoods,
      meals: preMeals,
      meal_items: preMealItems,
      food_favorites: preFavorites,
    });

    console.log('\nStarting atomic cleanup transaction...');
    await client.query('BEGIN;');

    // 1. Delete workout session telemetry & workout exercise mappings before exercises (respect FK ON DELETE RESTRICT)
    console.log('1. Deleting workout exercises and workout session history...');
    const delWorkoutEx = await client.query('DELETE FROM public.workout_exercises;');
    await client.query('DELETE FROM public.workout_session_sets;');
    await client.query('DELETE FROM public.personal_records;');
    await client.query('DELETE FROM public.workout_sessions;');

    // 2. Delete workouts (templates and custom)
    console.log('2. Deleting all workout templates and custom workouts...');
    const delWorkouts = await client.query('DELETE FROM public.workouts;');

    // 3. Delete exercises catalog
    console.log('3. Deleting all exercises (system and custom)...');
    const delExercises = await client.query('DELETE FROM public.exercises;');

    // 4. Delete meals and meal items
    console.log('4. Deleting meal items, meals, and food favorites...');
    const delMealItems = await client.query('DELETE FROM public.meal_items;');
    const delMeals = await client.query('DELETE FROM public.meals;');
    const delFavorites = await client.query('DELETE FROM public.food_favorites;');

    // 5. Delete foods catalog
    console.log('5. Deleting all foods (USDA reference and custom)...');
    const delFoods = await client.query('DELETE FROM public.foods;');

    // 6. Post-cleanup assertions INSIDE transaction
    console.log('\nAsserting post-cleanup target states inside transaction...');
    const postWorkouts = (await client.query('SELECT count(*)::int as c FROM public.workouts')).rows[0].c;
    const postWorkoutExercises = (await client.query('SELECT count(*)::int as c FROM public.workout_exercises')).rows[0].c;
    const postExercises = (await client.query('SELECT count(*)::int as c FROM public.exercises')).rows[0].c;
    const postFoods = (await client.query('SELECT count(*)::int as c FROM public.foods')).rows[0].c;
    const postMeals = (await client.query('SELECT count(*)::int as c FROM public.meals')).rows[0].c;
    const postMealItems = (await client.query('SELECT count(*)::int as c FROM public.meal_items')).rows[0].c;
    const postFavorites = (await client.query('SELECT count(*)::int as c FROM public.food_favorites')).rows[0].c;

    if (postWorkouts !== 0) throw new Error(`workouts is ${postWorkouts}, expected 0`);
    if (postWorkoutExercises !== 0) throw new Error(`workout_exercises is ${postWorkoutExercises}, expected 0`);
    if (postExercises !== 0) throw new Error(`exercises is ${postExercises}, expected 0`);
    if (postFoods !== 0) throw new Error(`foods is ${postFoods}, expected 0`);
    if (postMeals !== 0) throw new Error(`meals is ${postMeals}, expected 0`);
    if (postMealItems !== 0) throw new Error(`meal_items is ${postMealItems}, expected 0`);
    if (postFavorites !== 0) throw new Error(`food_favorites is ${postFavorites}, expected 0`);

    // Verify preserved system invariants
    const adminCheck = (await client.query("SELECT count(*)::int as c FROM public.users WHERE role = 'admin' AND email = 'admin@fitonus.com'")).rows[0].c;
    const geminiConfigCheck = (await client.query("SELECT count(*)::int as c FROM public.gemini_config")).rows[0].c;
    const appSettingsCheck = (await client.query("SELECT count(*)::int as c FROM public.app_settings")).rows[0].c;
    const geminiPricingCheck = (await client.query("SELECT count(*)::int as c FROM public.gemini_pricing")).rows[0].c;
    const migrationsCheck = (await client.query("SELECT count(*)::int as c FROM public.schema_migrations")).rows[0].c;
    const badgesCheck = (await client.query("SELECT count(*)::int as c FROM public.badges")).rows[0].c;

    if (adminCheck !== 1) throw new Error(`admin user check failed (${adminCheck})`);
    if (geminiConfigCheck !== 1) throw new Error(`gemini_config check failed (${geminiConfigCheck})`);
    if (appSettingsCheck !== 7) throw new Error(`app_settings check failed (${appSettingsCheck})`);
    if (geminiPricingCheck !== 9) throw new Error(`gemini_pricing check failed (${geminiPricingCheck})`);
    if (migrationsCheck < 19) throw new Error(`schema_migrations check failed (${migrationsCheck})`);
    if (badgesCheck !== 7) throw new Error(`badges check failed (${badgesCheck})`);

    await client.query('COMMIT;');
    console.log('\n✓ TRANSACTION COMMITTED SUCCESSFULLY!');
    console.log('✓ Summary of deletions:');
    console.log(`  - workout_exercises deleted: ${delWorkoutEx.rowCount}`);
    console.log(`  - workouts deleted: ${delWorkouts.rowCount}`);
    console.log(`  - exercises deleted: ${delExercises.rowCount}`);
    console.log(`  - meal_items deleted: ${delMealItems.rowCount}`);
    console.log(`  - meals deleted: ${delMeals.rowCount}`);
    console.log(`  - food_favorites deleted: ${delFavorites.rowCount}`);
    console.log(`  - foods deleted: ${delFoods.rowCount}`);

    console.log('\n✓ Preserved system essentials:');
    console.log(`  - admin@fitonus.com: ${adminCheck} user intact`);
    console.log(`  - gemini_config: ${geminiConfigCheck} config intact`);
    console.log(`  - app_settings: ${appSettingsCheck} settings intact`);
    console.log(`  - gemini_pricing: ${geminiPricingCheck} model pricing tiers intact`);
    console.log(`  - badges: ${badgesCheck} badges intact`);
    console.log(`  - schema_migrations: ${migrationsCheck} migrations intact`);

  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('CRITICAL: Cleanup failed and rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
