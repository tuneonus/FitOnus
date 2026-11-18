import { createPool } from '../src/database/pool.js';
import { Database } from '../src/database/transaction.js';
import { loadConfig } from '../src/config/env.js';
import { PgExerciseRepository } from '../src/modules/workouts/infrastructure/pg-exercise-repository.js';
import { PgWorkoutPlanRepository } from '../src/modules/workouts/infrastructure/pg-workout-repository.js';
import { PgFoodRepository } from '../src/modules/nutrition/infrastructure/pg-food-repository.js';

async function verify() {
  const config = loadConfig();
  const pool = createPool(config.database);
  try {
    const client = await pool.connect();
    await client.query('SET search_path = public;');

    console.log('=== 1. DATABASE RECORD COUNTS ===');
    const tables = ['workouts', 'workout_exercises', 'exercises', 'foods', 'meals', 'meal_items', 'food_favorites', 'workout_sessions', 'workout_session_sets'];
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const res = await client.query(`SELECT count(*)::int as c FROM public."${t}"`);
      counts[t] = res.rows[0].c;
    }
    console.table(counts);
    client.release();

    console.log('=== 2. BACKEND REPOSITORY RESPONSES (WHAT MOBILE RETRIEVES) ===');
    const database = new Database(pool);

    // Exercise list
    const exRepo = new PgExerciseRepository(database);
    const exerciseList = await exRepo.list({ limit: 50, offset: 0 });
    console.log('Exercise Repository list:', {
      total: exerciseList.total,
      exercisesLength: exerciseList.exercises.length,
    });

    // Workout templates / plans
    const workoutRepo = new PgWorkoutPlanRepository(database);
    const workoutTemplates = await workoutRepo.listSystemTemplates(0, 50);
    console.log('Workout Repository listSystemTemplates:', {
      total: workoutTemplates.total,
      plansLength: workoutTemplates.templates.length,
    });

    // Food list / search
    const foodRepo = new PgFoodRepository(database);
    const foodList = await foodRepo.search({ query: '', limit: 50, offset: 0 });
    console.log('Food Repository search:', {
      total: foodList.total,
      foodsLength: foodList.foods.length,
    });

    console.log('\n=== 3. PRESERVED ESSENTIALS ===');
    const preserved = await pool.query(`
      SELECT 
        (SELECT count(*) FROM public.users WHERE role='admin') as admin_count,
        (SELECT count(*) FROM public.gemini_config) as gemini_config_count,
        (SELECT count(*) FROM public.gemini_pricing) as gemini_pricing_count,
        (SELECT count(*) FROM public.app_settings) as app_settings_count,
        (SELECT count(*) FROM public.badges) as badges_count,
        (SELECT count(*) FROM public.schema_migrations) as migrations_count
    `);
    console.table(preserved.rows[0]);

  } finally {
    await pool.end();
  }
}

verify().catch(console.error);
