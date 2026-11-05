import type { SqlExecutor } from '../../../database/transaction.js';
import {
  type Sex,
  type FitnessGoal,
  type ExperienceLevel,
  type WorkoutPlace,
  type DietType,
  type OnboardingStep,
  UserProfile,
  type UserProfileProps,
} from '../domain/fitness-profile.js';
import type { ProfileRepository, ProfileWithIdentity, UpdateProfileParams } from '../application/ports.js';

interface ProfileRow {
  user_id: string;
  name: string;
  sex: Sex;
  date_of_birth: string | null;
  height_cm: string | null;
  current_weight_kg: string | null;
  target_weight_kg: string | null;
  primary_goal: FitnessGoal | null;
  experience_level: ExperienceLevel | null;
  preferred_workout_place: WorkoutPlace | null;
  workout_days_per_week: number | null;
  preferred_workout_duration_min: number | null;
  available_equipment: string[];
  diet_type: DietType | null;
  allergies: string[];
  preferred_cuisines: string[];
  onboarding_completed: boolean;
  current_onboarding_step: OnboardingStep;
  daily_calorie_target: number | null;
  daily_protein_grams: number | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const SELECT_JOINED = `
  SELECT
    p.user_id,
    u.display_name AS name,
    p.sex,
    CASE WHEN p.date_of_birth IS NOT NULL THEN to_char(p.date_of_birth, 'YYYY-MM-DD') ELSE NULL END AS date_of_birth,
    p.height_cm,
    p.current_weight_kg,
    p.target_weight_kg,
    p.primary_goal,
    p.experience_level,
    p.preferred_workout_place,
    p.workout_days_per_week,
    p.preferred_workout_duration_min,
    p.available_equipment,
    p.diet_type,
    p.allergies,
    p.preferred_cuisines,
    p.onboarding_completed,
    p.current_onboarding_step,
    p.daily_calorie_target,
    p.daily_protein_grams,
    p.version,
    p.created_at,
    p.updated_at
  FROM user_profiles p
  JOIN users u ON u.id = p.user_id
`;

const toProfileWithIdentity = (row: ProfileRow): ProfileWithIdentity => {
  const props: UserProfileProps = {
    userId: row.user_id,
    sex: row.sex,
    dateOfBirth: row.date_of_birth,
    heightCm: row.height_cm !== null ? Number(row.height_cm) : null,
    currentWeightKg: row.current_weight_kg !== null ? Number(row.current_weight_kg) : null,
    targetWeightKg: row.target_weight_kg !== null ? Number(row.target_weight_kg) : null,
    primaryGoal: row.primary_goal,
    experienceLevel: row.experience_level,
    preferredWorkoutPlace: row.preferred_workout_place,
    workoutDaysPerWeek: row.workout_days_per_week,
    preferredWorkoutDurationMin: row.preferred_workout_duration_min,
    availableEquipment: row.available_equipment ?? [],
    dietType: row.diet_type,
    allergies: row.allergies ?? [],
    preferredCuisines: row.preferred_cuisines ?? [],
    onboardingCompleted: row.onboarding_completed,
    currentOnboardingStep: row.current_onboarding_step,
    dailyCalorieTarget: row.daily_calorie_target,
    dailyProteinGrams: row.daily_protein_grams,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return {
    profile: UserProfile.reconstruct(props),
    name: row.name,
  };
};

export class PgProfileRepository implements ProfileRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findByUserId(userId: string): Promise<ProfileWithIdentity | null> {
    const { rows } = await this.db.query<ProfileRow>(`${SELECT_JOINED} WHERE p.user_id = $1`, [userId]);
    if (!rows[0]) return null;
    return toProfileWithIdentity(rows[0]);
  }

  async ensureProfile(userId: string): Promise<ProfileWithIdentity> {
    await this.db.query(
      `INSERT INTO user_profiles (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const result = await this.findByUserId(userId);
    if (!result) {
      throw new Error(`Failed to ensure user profile for user ${userId}`);
    }
    return result;
  }

  async updateProfile(
    userId: string,
    expectedVersion: number,
    changes: UpdateProfileParams,
  ): Promise<ProfileWithIdentity | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [userId, expectedVersion];

    const addClause = (col: string, val: unknown) => {
      values.push(val);
      setClauses.push(`${col} = $${values.length}`);
    };

    if (changes.sex !== undefined) addClause('sex', changes.sex);
    if (changes.dateOfBirth !== undefined) addClause('date_of_birth', changes.dateOfBirth);
    if (changes.heightCm !== undefined) addClause('height_cm', changes.heightCm);
    if (changes.currentWeightKg !== undefined) addClause('current_weight_kg', changes.currentWeightKg);
    if (changes.targetWeightKg !== undefined) addClause('target_weight_kg', changes.targetWeightKg);
    if (changes.primaryGoal !== undefined) addClause('primary_goal', changes.primaryGoal);
    if (changes.experienceLevel !== undefined) addClause('experience_level', changes.experienceLevel);
    if (changes.preferredWorkoutPlace !== undefined)
      addClause('preferred_workout_place', changes.preferredWorkoutPlace);
    if (changes.workoutDaysPerWeek !== undefined)
      addClause('workout_days_per_week', changes.workoutDaysPerWeek);
    if (changes.preferredWorkoutDurationMin !== undefined)
      addClause('preferred_workout_duration_min', changes.preferredWorkoutDurationMin);
    if (changes.availableEquipment !== undefined)
      addClause('available_equipment', changes.availableEquipment);
    if (changes.dietType !== undefined) addClause('diet_type', changes.dietType);
    if (changes.allergies !== undefined) addClause('allergies', changes.allergies);
    if (changes.preferredCuisines !== undefined) addClause('preferred_cuisines', changes.preferredCuisines);
    if (changes.dailyCalorieTarget !== undefined)
      addClause('daily_calorie_target', changes.dailyCalorieTarget);
    if (changes.dailyProteinGrams !== undefined) addClause('daily_protein_grams', changes.dailyProteinGrams);

    // Always check expectedVersion and increment version on user_profiles
    setClauses.push('version = version + 1');
    setClauses.push('updated_at = now()');

    const updateSql = `
      UPDATE user_profiles
      SET ${setClauses.join(', ')}
      WHERE user_id = $1 AND version = $2
    `;
    const updateResult = await this.db.query(updateSql, values);
    if (updateResult.rowCount === 0) {
      return null;
    }

    if (changes.name !== undefined) {
      await this.db.query(`UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2`, [
        changes.name,
        userId,
      ]);
    }

    return this.findByUserId(userId);
  }

  async saveOnboardingStep(
    userId: string,
    step: OnboardingStep,
    data: Record<string, unknown>,
  ): Promise<ProfileWithIdentity> {
    await this.ensureProfile(userId);

    const changes: UpdateProfileParams = {};
    if (typeof data.name === 'string' && data.name.trim().length > 0) {
      changes.name = data.name.trim();
    }
    if (data.sex === 'male' || data.sex === 'female' || data.sex === 'unspecified') {
      changes.sex = data.sex;
    }
    if (typeof data.dob === 'string') {
      changes.dateOfBirth = data.dob;
    } else if (
      typeof data.dobYear === 'number' &&
      typeof data.dobMonth === 'number' &&
      typeof data.dobDay === 'number'
    ) {
      const y = String(data.dobYear).padStart(4, '0');
      const m = String(data.dobMonth).padStart(2, '0');
      const d = String(data.dobDay).padStart(2, '0');
      changes.dateOfBirth = `${y}-${m}-${d}`;
    }
    if (typeof data.heightCm === 'number') {
      changes.heightCm = data.heightCm;
    }
    if (typeof data.weightKg === 'number') {
      changes.currentWeightKg = data.weightKg;
    }
    if (typeof data.targetWeightKg === 'number') {
      changes.targetWeightKg = data.targetWeightKg;
    }
    if (typeof data.experience === 'string') {
      changes.experienceLevel = data.experience as ExperienceLevel;
    }
    if (typeof data.goal === 'string') {
      changes.primaryGoal = data.goal as FitnessGoal;
    }
    if (typeof data.place === 'string') {
      changes.preferredWorkoutPlace = data.place as WorkoutPlace;
    }
    if (typeof data.daysPerWeek === 'number') {
      changes.workoutDaysPerWeek = data.daysPerWeek;
    }
    if (typeof data.durationMin === 'number') {
      changes.preferredWorkoutDurationMin = data.durationMin;
    }
    if (Array.isArray(data.equipment)) {
      changes.availableEquipment = data.equipment.filter((e): e is string => typeof e === 'string');
    }
    if (typeof data.diet === 'string') {
      changes.dietType = data.diet as DietType;
    }
    if (Array.isArray(data.allergies)) {
      changes.allergies = data.allergies.filter((a): a is string => typeof a === 'string');
    }
    if (Array.isArray(data.cuisines)) {
      changes.preferredCuisines = data.cuisines.filter((c): c is string => typeof c === 'string');
    }

    // Health & device settings updates if present
    if (typeof data.healthAllowed === 'boolean') {
      await this.db.query(
        `INSERT INTO user_settings (user_id, health_connect_enabled)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET health_connect_enabled = $2, updated_at = now()`,
        [userId, data.healthAllowed],
      );
    }
    if (typeof data.deviceConnected === 'boolean') {
      await this.db.query(
        `INSERT INTO user_settings (user_id, smartwatch_connected)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET smartwatch_connected = $2, updated_at = now()`,
        [userId, data.deviceConnected],
      );
    }

    if (changes.name) {
      await this.db.query(`UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2`, [
        changes.name,
        userId,
      ]);
    }

    const setClauses: string[] = ['current_onboarding_step = $2'];
    const values: unknown[] = [userId, step];

    const addClause = (col: string, val: unknown) => {
      values.push(val);
      setClauses.push(`${col} = $${values.length}`);
    };

    if (changes.sex !== undefined) addClause('sex', changes.sex);
    if (changes.dateOfBirth !== undefined) addClause('date_of_birth', changes.dateOfBirth);
    if (changes.heightCm !== undefined) addClause('height_cm', changes.heightCm);
    if (changes.currentWeightKg !== undefined) addClause('current_weight_kg', changes.currentWeightKg);
    if (changes.targetWeightKg !== undefined) addClause('target_weight_kg', changes.targetWeightKg);
    if (changes.primaryGoal !== undefined) addClause('primary_goal', changes.primaryGoal);
    if (changes.experienceLevel !== undefined) addClause('experience_level', changes.experienceLevel);
    if (changes.preferredWorkoutPlace !== undefined)
      addClause('preferred_workout_place', changes.preferredWorkoutPlace);
    if (changes.workoutDaysPerWeek !== undefined)
      addClause('workout_days_per_week', changes.workoutDaysPerWeek);
    if (changes.preferredWorkoutDurationMin !== undefined)
      addClause('preferred_workout_duration_min', changes.preferredWorkoutDurationMin);
    if (changes.availableEquipment !== undefined)
      addClause('available_equipment', changes.availableEquipment);
    if (changes.dietType !== undefined) addClause('diet_type', changes.dietType);
    if (changes.allergies !== undefined) addClause('allergies', changes.allergies);
    if (changes.preferredCuisines !== undefined) addClause('preferred_cuisines', changes.preferredCuisines);

    setClauses.push('version = version + 1');
    setClauses.push('updated_at = now()');

    await this.db.query(
      `UPDATE user_profiles
       SET ${setClauses.join(', ')}
       WHERE user_id = $1`,
      values,
    );

    const result = await this.findByUserId(userId);
    return result!;
  }

  async completeOnboarding(
    userId: string,
    targets: { dailyCalorieTarget: number; dailyProteinGrams: number },
  ): Promise<ProfileWithIdentity> {
    await this.db.query(
      `UPDATE user_profiles
       SET
         onboarding_completed = true,
         current_onboarding_step = 'done',
         daily_calorie_target = $2,
         daily_protein_grams = $3,
         version = version + 1,
         updated_at = now()
       WHERE user_id = $1`,
      [userId, targets.dailyCalorieTarget, targets.dailyProteinGrams],
    );

    const result = await this.findByUserId(userId);
    return result!;
  }
}
