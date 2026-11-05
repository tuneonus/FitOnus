import type { SqlExecutor } from '../../../database/transaction.js';
import type { ExerciseDifficulty } from '../domain/exercise.js';
import { WorkoutPlan, WorkoutPlanExercise } from '../domain/workout-plan.js';
import type { IWorkoutPlanRepository, WorkoutPlanFilter } from '../application/ports.js';

interface WorkoutRow {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  workout_type: string;
  estimated_duration_minutes: number;
  difficulty: ExerciseDifficulty;
  is_template: boolean;
  is_ai_generated: boolean;
  tags: string[];
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps: string;
  target_duration_seconds: number | null;
  target_weight_kg: string | number;
  rest_seconds: number;
  notes: string | null;
  superset_group: number | null;
  created_at: Date;
}

function toExerciseDomain(row: WorkoutExerciseRow): WorkoutPlanExercise {
  return new WorkoutPlanExercise({
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    orderIndex: row.order_index,
    targetSets: row.target_sets,
    targetReps: row.target_reps,
    targetDurationSeconds: row.target_duration_seconds,
    targetWeightKg: Number(row.target_weight_kg),
    restSeconds: row.rest_seconds,
    notes: row.notes,
    supersetGroup: row.superset_group,
    createdAt: row.created_at,
  });
}

function toPlanDomain(row: WorkoutRow, exercises: WorkoutPlanExercise[] = []): WorkoutPlan {
  return new WorkoutPlan({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    workoutType: row.workout_type,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    difficulty: row.difficulty,
    isTemplate: row.is_template,
    isAiGenerated: row.is_ai_generated,
    tags: row.tags ?? [],
    exercises,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgWorkoutPlanRepository implements IWorkoutPlanRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<WorkoutPlan | null> {
    const planRes = await this.db.query<WorkoutRow>(
      `SELECT * FROM workouts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    if (!planRes.rows[0]) return null;

    const exRes = await this.db.query<WorkoutExerciseRow>(
      `SELECT * FROM workout_exercises WHERE workout_id = $1 ORDER BY order_index ASC`,
      [id],
    );

    return toPlanDomain(planRes.rows[0], exRes.rows.map(toExerciseDomain));
  }

  async listForUser(
    userId: string,
    filter: WorkoutPlanFilter,
  ): Promise<{ plans: WorkoutPlan[]; total: number }> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (filter.type === 'mine') {
      conditions.push(`user_id = $${idx}`);
      values.push(userId);
      idx++;
    } else if (filter.type === 'templates') {
      conditions.push(`is_template = true AND user_id IS NULL`);
    } else {
      // 'all': user's personal plans OR system templates
      conditions.push(`(user_id = $${idx} OR (is_template = true AND user_id IS NULL))`);
      values.push(userId);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workouts WHERE ${whereClause}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const listQuery = `
      SELECT *
      FROM workouts
      WHERE ${whereClause}
      ORDER BY is_template DESC, created_at DESC
      OFFSET $${idx}
      LIMIT $${idx + 1}
    `;
    values.push(filter.offset, filter.limit);

    const plansRes = await this.db.query<WorkoutRow>(listQuery, values);
    if (plansRes.rows.length === 0) {
      return { plans: [], total };
    }

    const planIds = plansRes.rows.map((r) => r.id);
    const exRes = await this.db.query<WorkoutExerciseRow>(
      `SELECT * FROM workout_exercises WHERE workout_id = ANY($1) ORDER BY order_index ASC`,
      [planIds],
    );

    const exercisesByWorkout = new Map<string, WorkoutPlanExercise[]>();
    for (const exRow of exRes.rows) {
      const list = exercisesByWorkout.get(exRow.workout_id) ?? [];
      list.push(toExerciseDomain(exRow));
      exercisesByWorkout.set(exRow.workout_id, list);
    }

    const plans = plansRes.rows.map((r) => toPlanDomain(r, exercisesByWorkout.get(r.id) ?? []));
    return { plans, total };
  }

  async listSystemTemplates(
    offset: number,
    limit: number,
    search?: string,
  ): Promise<{ templates: WorkoutPlan[]; total: number }> {
    const conditions: string[] = ['is_template = true', 'user_id IS NULL', 'deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (search && search.trim().length > 0) {
      conditions.push(`name ILIKE $${idx}`);
      values.push(`%${search.trim()}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workouts WHERE ${whereClause}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const listQuery = `
      SELECT *
      FROM workouts
      WHERE ${whereClause}
      ORDER BY created_at DESC
      OFFSET $${idx}
      LIMIT $${idx + 1}
    `;
    values.push(offset, limit);

    const templatesRes = await this.db.query<WorkoutRow>(listQuery, values);
    if (templatesRes.rows.length === 0) {
      return { templates: [], total };
    }

    const templateIds = templatesRes.rows.map((r) => r.id);
    const exRes = await this.db.query<WorkoutExerciseRow>(
      `SELECT * FROM workout_exercises WHERE workout_id = ANY($1) ORDER BY order_index ASC`,
      [templateIds],
    );

    const exercisesByTemplate = new Map<string, WorkoutPlanExercise[]>();
    for (const exRow of exRes.rows) {
      const list = exercisesByTemplate.get(exRow.workout_id) ?? [];
      list.push(toExerciseDomain(exRow));
      exercisesByTemplate.set(exRow.workout_id, list);
    }

    const templates = templatesRes.rows.map((r) => toPlanDomain(r, exercisesByTemplate.get(r.id) ?? []));
    return { templates, total };
  }

  async create(plan: WorkoutPlan): Promise<WorkoutPlan> {
    await this.db.query(
      `
      INSERT INTO workouts (
        id, user_id, name, description, workout_type,
        estimated_duration_minutes, difficulty, is_template, is_ai_generated,
        tags, created_at, updated_at, deleted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        plan.id,
        plan.userId,
        plan.name,
        plan.description,
        plan.workoutType,
        plan.estimatedDurationMinutes,
        plan.difficulty,
        plan.isTemplate,
        plan.isAiGenerated,
        [...plan.tags],
        plan.createdAt,
        plan.updatedAt,
        plan.deletedAt,
      ],
    );

    for (const ex of plan.exercises) {
      await this.db.query(
        `
        INSERT INTO workout_exercises (
          id, workout_id, exercise_id, order_index, target_sets,
          target_reps, target_duration_seconds, target_weight_kg,
          rest_seconds, notes, superset_group, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          ex.id,
          ex.workoutId,
          ex.exerciseId,
          ex.orderIndex,
          ex.targetSets,
          ex.targetReps,
          ex.targetDurationSeconds,
          ex.targetWeightKg,
          ex.restSeconds,
          ex.notes,
          ex.supersetGroup,
          ex.createdAt,
        ],
      );
    }

    return plan;
  }

  async update(id: string, plan: WorkoutPlan): Promise<WorkoutPlan | null> {
    await this.db.query(
      `
      UPDATE workouts
      SET
        name = $2,
        description = $3,
        workout_type = $4,
        estimated_duration_minutes = $5,
        difficulty = $6,
        tags = $7,
        updated_at = $8
      WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        id,
        plan.name,
        plan.description,
        plan.workoutType,
        plan.estimatedDurationMinutes,
        plan.difficulty,
        [...plan.tags],
        plan.updatedAt,
      ],
    );

    // Replace exercises atomically
    await this.db.query(`DELETE FROM workout_exercises WHERE workout_id = $1`, [id]);
    for (const ex of plan.exercises) {
      await this.db.query(
        `
        INSERT INTO workout_exercises (
          id, workout_id, exercise_id, order_index, target_sets,
          target_reps, target_duration_seconds, target_weight_kg,
          rest_seconds, notes, superset_group, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          ex.id,
          ex.workoutId,
          ex.exerciseId,
          ex.orderIndex,
          ex.targetSets,
          ex.targetReps,
          ex.targetDurationSeconds,
          ex.targetWeightKg,
          ex.restSeconds,
          ex.notes,
          ex.supersetGroup,
          ex.createdAt,
        ],
      );
    }

    return plan;
  }

  async softDelete(id: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE workouts SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async countSystemTemplates(): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workouts WHERE is_template = true AND user_id IS NULL AND deleted_at IS NULL`,
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }
}
