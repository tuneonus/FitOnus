import type { Database } from '../../../database/transaction.js';
import type { UserContextRepository } from '../application/ports.js';
import type {
  ActiveGoalContext,
  RecentWorkoutContext,
  UserFitnessContext,
  UserFitnessProfile,
} from '../domain/coach.types.js';

interface ProfileRow {
  display_name: string;
  sex: string | null;
  date_of_birth: string | null;
  height_cm: string | null;
  current_weight_kg: string | null;
  target_weight_kg: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  preferred_workout_place: string | null;
  workout_days_per_week: number | null;
  diet_type: string | null;
  daily_calorie_target: number | null;
  daily_protein_grams: number | null;
}

interface NutritionRow {
  total_calories: string;
  total_protein: string;
  total_carbs: string;
  total_fat: string;
}

interface WaterRow {
  total_water_ml: number;
}

interface WorkoutRow {
  workout_name: string;
  duration_seconds: number;
  total_volume_kg: string;
  total_sets: number;
  calories_burned: number | null;
  completed_at: Date;
}

interface PlannedWorkoutRow {
  name: string;
  estimated_duration_minutes: number;
  exercises_count: number;
}

interface GoalRow {
  title: string;
  category: string;
  target_value: string;
  current_value: string;
  unit: string;
}

interface WeightRow {
  weight_kg: string;
}

function calculateAge(dobStr: string | null): number | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 && age < 130 ? age : null;
}

export class PgUserContextRepository implements UserContextRepository {
  constructor(private readonly db: Database) {}

  async getUserFitnessContext(userId: string, timezone: string = 'UTC'): Promise<UserFitnessContext> {
    const tz = timezone || 'UTC';
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    // 1. User profile
    const { rows: profileRows } = await this.db.query<ProfileRow>(
      `SELECT u.display_name,
              p.sex,
              p.date_of_birth::text,
              p.height_cm::text,
              p.current_weight_kg::text,
              p.target_weight_kg::text,
              p.primary_goal,
              p.experience_level,
              p.preferred_workout_place,
              p.workout_days_per_week,
              p.diet_type,
              p.daily_calorie_target,
              p.daily_protein_grams
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );

    const prow = profileRows[0];
    const profile: UserFitnessProfile = {
      displayName: prow?.display_name || 'Athlete',
      sex: prow?.sex || null,
      age: calculateAge(prow?.date_of_birth ?? null),
      heightCm: prow?.height_cm ? Number(prow.height_cm) : null,
      currentWeightKg: prow?.current_weight_kg ? Number(prow.current_weight_kg) : null,
      targetWeightKg: prow?.target_weight_kg ? Number(prow.target_weight_kg) : null,
      primaryGoal: prow?.primary_goal || null,
      experienceLevel: prow?.experience_level || null,
      preferredWorkoutPlace: prow?.preferred_workout_place || null,
      workoutDaysPerWeek: prow?.workout_days_per_week ?? null,
      dietType: prow?.diet_type || null,
      dailyCalorieTarget: prow?.daily_calorie_target ?? null,
      dailyProteinGrams: prow?.daily_protein_grams ?? null,
    };

    // 2. Nutrition today
    const { rows: nutritionRows } = await this.db.query<NutritionRow>(
      `SELECT
         COALESCE(SUM(total_calories), 0)::numeric AS total_calories,
         COALESCE(SUM(total_protein_g), 0)::numeric AS total_protein,
         COALESCE(SUM(total_carbs_g), 0)::numeric AS total_carbs,
         COALESCE(SUM(total_fat_g), 0)::numeric AS total_fat
       FROM meals
       WHERE user_id = $1 AND date = $2::date AND deleted_at IS NULL`,
      [userId, todayStr],
    );
    const nut = nutritionRows[0];

    // 3. Water today
    const { rows: waterRows } = await this.db.query<WaterRow>(
      `SELECT COALESCE(SUM(amount_ml), 0)::integer AS total_water_ml
       FROM water_intake
       WHERE user_id = $1 AND date = $2::date`,
      [userId, todayStr],
    );

    // 4. Recent workouts
    const { rows: workoutRows } = await this.db.query<WorkoutRow>(
      `SELECT workout_name, duration_seconds, total_volume_kg::text, total_sets, calories_burned, completed_at
       FROM workout_sessions
       WHERE user_id = $1 AND is_completed = true
       ORDER BY completed_at DESC
       LIMIT 3`,
      [userId],
    );

    const recentWorkouts: RecentWorkoutContext[] = workoutRows.map((r) => ({
      name: r.workout_name,
      durationMinutes: Math.round(r.duration_seconds / 60),
      volumeKg: Math.round(Number(r.total_volume_kg || 0)),
      totalSets: r.total_sets,
      caloriesBurned: r.calories_burned,
      completedAt: r.completed_at.toISOString(),
    }));

    // 5. Planned workout for today
    const { rows: plannedRows } = await this.db.query<PlannedWorkoutRow>(
      `SELECT w.name, w.estimated_duration_minutes,
              COUNT(we.id)::integer AS exercises_count
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id = w.id
       WHERE (w.user_id = $1 OR w.is_template = true) AND w.deleted_at IS NULL
       GROUP BY w.id, w.name, w.estimated_duration_minutes, w.user_id, w.created_at
       ORDER BY (w.user_id = $1) DESC, w.created_at ASC
       LIMIT 1`,
      [userId],
    );

    const planned = plannedRows[0];
    const todayPlannedWorkout = planned
      ? {
          name: planned.name,
          durationMinutes: planned.estimated_duration_minutes || 45,
          exercisesCount: planned.exercises_count || 5,
        }
      : null;

    // 6. Active goals
    const { rows: goalRows } = await this.db.query<GoalRow>(
      `SELECT title, type AS category, target_value::text, current_value::text, metric_unit AS unit
       FROM goals
       WHERE user_id = $1 AND status = 'active' AND deleted_at IS NULL
       LIMIT 5`,
      [userId],
    );

    const activeGoals: ActiveGoalContext[] = goalRows.map((g) => ({
      title: g.title,
      category: g.category,
      targetValue: Number(g.target_value),
      currentValue: Number(g.current_value),
      unit: g.unit,
    }));

    // 7. Latest weight
    const { rows: weightRows } = await this.db.query<WeightRow>(
      `SELECT weight_kg::text
       FROM weight_logs
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY logged_at DESC
       LIMIT 1`,
      [userId],
    );
    const latestWeightKg = weightRows[0] ? Number(weightRows[0].weight_kg) : null;

    return {
      profile,
      todayNutrition: {
        caloriesConsumed: Math.round(Number(nut?.total_calories || 0)),
        proteinGrams: Math.round(Number(nut?.total_protein || 0)),
        carbsGrams: Math.round(Number(nut?.total_carbs || 0)),
        fatGrams: Math.round(Number(nut?.total_fat || 0)),
        waterIntakeMl: waterRows[0]?.total_water_ml || 0,
        calorieTarget: profile.dailyCalorieTarget,
        proteinTarget: profile.dailyProteinGrams,
      },
      recentWorkouts,
      todayPlannedWorkout,
      activeGoals,
      latestWeightKg,
    };
  }
}

