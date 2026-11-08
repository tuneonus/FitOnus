import type { SqlExecutor } from '../../../database/transaction.js';
import {
  formatLocalDate,
  validateTimezone,
} from '../../analytics/index.js';
import type { DashboardRepository } from '../application/ports.js';
import type {
  ActivityProgress,
  AISummary,
  DailySummary,
  DashboardSummary,
  NutritionSummary,
  RecentActivity,
  TodayWorkout,
} from '../domain/dashboard-summary.js';

interface UserProfileRow {
  id: string;
  display_name: string;
  sex: string | null;
  date_of_birth: string | null;
  height_cm: string | null;
  current_weight_kg: string | null;
  target_weight_kg: string | null;
  primary_goal: string | null;
  workout_days_per_week: number | null;
  daily_calorie_target: number | null;
  daily_protein_grams: number | null;
}

interface NutritionAggregateRow {
  total_calories: string;
  total_protein: string;
  total_carbs: string;
  total_fat: string;
}

interface WaterAggregateRow {
  total_water_ml: number;
}

interface WorkoutSessionRow {
  id: string;
  workout_name: string;
  duration_seconds: number;
  total_volume_kg: string;
  total_sets: number;
  calories_burned: number | null;
  completed_at: Date;
}

interface CountRow {
  completed_this_week: number;
}

interface WorkoutPlanRow {
  id: string;
  name: string;
  estimated_duration_minutes: number;
  exercises_count: number;
}

interface WeightLogRow {
  weight_kg: string;
  logged_at: Date;
}

interface RecentActivityRow {
  id: string;
  title: string;
  subtitle: string;
  timestamp: Date;
  type: 'workout' | 'meal' | 'weight';
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
  return age > 0 ? age : null;
}

function getLocalHour(date: Date, timezone: string): number {
  const tz = validateTimezone(timezone);
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(date);
  return parseInt(hourStr, 10) || 0;
}

export class PgDashboardRepository implements DashboardRepository {
  constructor(private readonly db: SqlExecutor) {}

  async getDashboardData(userId: string, timezoneInput: string): Promise<DashboardSummary> {
    const tz = validateTimezone(timezoneInput);
    const now = new Date();
    const todayStr = formatLocalDate(now, tz);

    // Calculate Monday of current week in local timezone for weekly progress
    const dayOfWeekStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const daysSinceMonday = dayMap[dayOfWeekStr] ?? 0;
    const mondayDate = new Date(now.getTime() - daysSinceMonday * 86_400_000);
    const mondayStr = formatLocalDate(mondayDate, tz);

    // 1. User & Profile
    const { rows: userRows } = await this.db.query<UserProfileRow>(
      `SELECT u.id, u.display_name,
              p.sex, p.date_of_birth, p.height_cm, p.current_weight_kg, p.target_weight_kg,
              p.primary_goal, p.workout_days_per_week, p.daily_calorie_target, p.daily_protein_grams
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const userRow = userRows[0];
    const userDisplayName = userRow?.display_name || 'Athlete';
    const firstName = userDisplayName.split(' ')[0] || userDisplayName;

    // 2. Nutrition for today in local timezone
    const { rows: nutritionRows } = await this.db.query<NutritionAggregateRow>(
      `SELECT
         COALESCE(SUM(total_calories), 0)::numeric AS total_calories,
         COALESCE(SUM(total_protein_g), 0)::numeric AS total_protein,
         COALESCE(SUM(total_carbs_g), 0)::numeric AS total_carbs,
         COALESCE(SUM(total_fat_g), 0)::numeric AS total_fat
       FROM meals
       WHERE user_id = $1 AND date = $2::date AND deleted_at IS NULL`,
      [userId, todayStr]
    );
    const nutRow = nutritionRows[0];
    const caloriesConsumed = Math.round(Number(nutRow?.total_calories || 0));
    const proteinConsumed = Math.round(Number(nutRow?.total_protein || 0));
    const carbsConsumed = Math.round(Number(nutRow?.total_carbs || 0));
    const fatConsumed = Math.round(Number(nutRow?.total_fat || 0));

    // 3. Water for today in local timezone
    const { rows: waterRows } = await this.db.query<WaterAggregateRow>(
      `SELECT COALESCE(SUM(amount_ml), 0)::integer AS total_water_ml
       FROM water_intake
       WHERE user_id = $1 AND date = $2::date`,
      [userId, todayStr]
    );
    const waterIntakeMl = waterRows[0]?.total_water_ml || 0;
    const waterIntakeLiters = Math.round((waterIntakeMl / 1000) * 10) / 10;

    // 4. Workouts completed today in local timezone
    const { rows: todayWorkoutRows } = await this.db.query<WorkoutSessionRow>(
      `SELECT id, workout_name, duration_seconds, total_volume_kg, total_sets, calories_burned, completed_at
       FROM workout_sessions
       WHERE user_id = $1
         AND is_completed = true
         AND (completed_at AT TIME ZONE $2)::date = $3::date
       ORDER BY completed_at DESC`,
      [userId, tz, todayStr]
    );

    const caloriesBurned = todayWorkoutRows.reduce((sum, r) => sum + (r.calories_burned || 0), 0);
    const activeMinutes = Math.round(
      todayWorkoutRows.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / 60
    );
    const completedWorkoutsToday = todayWorkoutRows.length;

    // 5. Workouts completed this week
    const { rows: weekRows } = await this.db.query<CountRow>(
      `SELECT COUNT(id)::integer AS completed_this_week
       FROM workout_sessions
       WHERE user_id = $1
         AND is_completed = true
         AND (completed_at AT TIME ZONE $2)::date >= $3::date
         AND (completed_at AT TIME ZONE $2)::date <= $4::date`,
      [userId, tz, mondayStr, todayStr]
    );
    const workoutsCompletedThisWeek = weekRows[0]?.completed_this_week || 0;

    // 6. Next / Today's planned workout
    const { rows: planRows } = await this.db.query<WorkoutPlanRow>(
      `SELECT w.id, w.name, w.estimated_duration_minutes,
              COUNT(we.id)::integer AS exercises_count
       FROM workouts w
       LEFT JOIN workout_exercises we ON we.workout_id = w.id
       WHERE (w.user_id = $1 OR w.is_template = true) AND w.deleted_at IS NULL
       GROUP BY w.id, w.name, w.estimated_duration_minutes, w.user_id, w.created_at
       ORDER BY (w.user_id = $1) DESC, w.created_at ASC
       LIMIT 1`,
      [userId]
    );

    let todayWorkout: TodayWorkout | null = null;
    const p = planRows[0];
    if (p) {
      const duration = p.estimated_duration_minutes || 45;
      todayWorkout = {
        id: p.id,
        name: p.name,
        duration,
        exercises: p.exercises_count || 5,
        estimatedCalories: Math.round(duration * 7.5),
      };
    }

    // 7. Latest Weight
    const { rows: weightRows } = await this.db.query<WeightLogRow>(
      `SELECT weight_kg, logged_at
       FROM weight_logs
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY logged_at DESC
       LIMIT 1`,
      [userId]
    );
    const latestWeight = weightRows[0] ? Number(weightRows[0].weight_kg) : null;

    // 8. Recent Activity (up to 5 most recent items across workouts, meals, weight)
    const { rows: activityRows } = await this.db.query<RecentActivityRow>(
      `(SELECT id, workout_name AS title,
               round(duration_seconds / 60)::text || ' mins • ' || COALESCE(calories_burned, 0)::text || ' kcal' AS subtitle,
               completed_at AS timestamp,
               'workout'::text AS type
        FROM workout_sessions
        WHERE user_id = $1 AND is_completed = true
        ORDER BY completed_at DESC
        LIMIT 3)
       UNION ALL
       (SELECT id,
               INITCAP(meal_type) AS title,
               round(total_calories)::text || ' kcal • ' || round(total_protein_g)::text || 'g Protein' AS subtitle,
               created_at AS timestamp,
               'meal'::text AS type
        FROM meals
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 3)
       UNION ALL
       (SELECT id,
               'Logged Weight' AS title,
               weight_kg::text || ' kg' AS subtitle,
               logged_at AS timestamp,
               'weight'::text AS type
        FROM weight_logs
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY logged_at DESC
        LIMIT 2)
       ORDER BY timestamp DESC
       LIMIT 5`,
      [userId]
    );

    const recentActivity: RecentActivity[] = activityRows.map((r) => {
      const actDate = new Date(r.timestamp);
      const actDateStr = formatLocalDate(actDate, tz);
      let relativeTime: string;
      if (actDateStr === todayStr) {
        relativeTime = 'Today';
      } else {
        const yesterdayDate = new Date(now.getTime() - 86_400_000);
        const yesterdayStr = formatLocalDate(yesterdayDate, tz);
        if (actDateStr === yesterdayStr) {
          relativeTime = 'Yesterday';
        } else {
          relativeTime = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            month: 'short',
            day: 'numeric',
          }).format(actDate);
        }
      }
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        subtitle: r.subtitle,
        timestamp: relativeTime,
      };
    });

    // 9. Derive Goals & Targets
    let caloriesGoal = 2200;
    let proteinGoal = 150;
    let carbsGoal = 250;
    let fatGoal = 70;

    if (userRow?.daily_calorie_target && userRow.daily_calorie_target > 500) {
      caloriesGoal = userRow.daily_calorie_target;
      proteinGoal = userRow.daily_protein_grams || Math.round((caloriesGoal * 0.25) / 4);
      carbsGoal = Math.round((caloriesGoal * 0.5) / 4);
      fatGoal = Math.round((caloriesGoal * 0.25) / 9);
    } else if (
      userRow?.current_weight_kg &&
      userRow?.height_cm &&
      userRow?.date_of_birth
    ) {
      const age = calculateAge(userRow.date_of_birth);
      if (age) {
        const weightKg = Number(userRow.current_weight_kg);
        const heightCm = Number(userRow.height_cm);
        const sex = userRow.sex || 'unspecified';
        const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
        const bmr = sex === 'male' ? Math.round(base + 5) : sex === 'female' ? Math.round(base - 161) : Math.round(base - 78);
        const mult = !userRow.workout_days_per_week || userRow.workout_days_per_week <= 0
          ? 1.2
          : userRow.workout_days_per_week <= 2
            ? 1.375
            : userRow.workout_days_per_week <= 4
              ? 1.55
              : userRow.workout_days_per_week <= 6
                ? 1.725
                : 1.9;
        const tdee = Math.round(bmr * mult);
        const goal = userRow.primary_goal;
        caloriesGoal = goal === 'fat_loss' ? Math.max(1200, Math.round(tdee - 500)) : goal === 'muscle_gain' ? Math.round(tdee + 300) : tdee;
        proteinGoal = Math.round((caloriesGoal * 0.25) / 4);
        carbsGoal = Math.round((caloriesGoal * 0.5) / 4);
        fatGoal = Math.round((caloriesGoal * 0.25) / 9);
      }
    }

    const weeklyTargetDays = userRow?.workout_days_per_week || 4;
    const weeklyGoalProgress = Math.min(1, Math.round((workoutsCompletedThisWeek / weeklyTargetDays) * 100) / 100);
    const dailyGoalProgress = completedWorkoutsToday > 0 ? 1 : Math.min(1, Math.round((caloriesBurned / 400) * 100) / 100);

    // 10. AI Summary
    const localHour = getLocalHour(now, tz);
    const greetingTime = localHour < 12 ? 'Good morning' : localHour < 17 ? 'Good afternoon' : 'Good evening';
    const greeting = `${greetingTime}, ${firstName}!`;

    let recommendation: string;
    if (completedWorkoutsToday > 0) {
      recommendation = 'Great work completing your workout today! Drink plenty of water and prioritize high-protein recovery.';
    } else if (todayWorkout) {
      recommendation = `Today's recommendation:\n${todayWorkout.name} (${todayWorkout.duration} mins).`;
    } else {
      recommendation = 'Take today to recover, keep hydrated, and hit your nutrition targets.';
    }

    const aiSummary: AISummary = {
      greeting,
      sleepInsights: null,
      recoveryInsights: null,
      recommendation,
    };

    const dailySummary: DailySummary = {
      recoveryScore: null,
      sleepScore: null,
      sleepDuration: null,
      steps: null,
      caloriesBurned,
      caloriesConsumed,
      activeMinutes,
      waterIntake: waterIntakeLiters,
      waterIntakeMl,
      heartRate: null,
      weight: latestWeight,
    };

    const nutrition: NutritionSummary = {
      calories: caloriesConsumed,
      caloriesGoal,
      protein: proteinConsumed,
      proteinGoal,
      carbs: carbsConsumed,
      carbsGoal,
      fat: fatConsumed,
      fatGoal,
    };

    const progress: ActivityProgress = {
      dailyGoalProgress,
      weeklyGoalProgress,
    };

    return {
      userDisplayName,
      summary: dailySummary,
      aiSummary,
      todayWorkout,
      nutrition,
      progress,
      recentActivity,
    };
  }
}
