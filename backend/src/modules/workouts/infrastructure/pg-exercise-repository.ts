import type { SqlExecutor } from '../../../database/transaction.js';
import { Exercise, type ExerciseDifficulty, type ExerciseProps } from '../domain/exercise.js';
import type { ExerciseFilter, IExerciseRepository } from '../application/ports.js';

interface ExerciseRow {
  id: string;
  name: string;
  description: string | null;
  instructions: unknown;
  tips: unknown;
  common_mistakes: unknown;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string;
  category: string;
  difficulty: ExerciseDifficulty;
  is_compound: boolean;
  image_url: string | null;
  video_url: string | null;
  created_by: string | null;
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed: unknown = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

function toDomain(row: ExerciseRow): Exercise {
  return new Exercise({
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: parseJsonArray(row.instructions),
    tips: parseJsonArray(row.tips),
    commonMistakes: parseJsonArray(row.common_mistakes),
    primaryMuscles: row.primary_muscles ?? [],
    secondaryMuscles: row.secondary_muscles ?? [],
    equipment: row.equipment,
    category: row.category,
    difficulty: row.difficulty,
    isCompound: row.is_compound,
    imageUrl: row.image_url,
    videoUrl: row.video_url,
    createdBy: row.created_by,
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgExerciseRepository implements IExerciseRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<Exercise | null> {
    const res = await this.db.query<ExerciseRow>(
      `SELECT * FROM exercises WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async list(filter: ExerciseFilter): Promise<{ exercises: Exercise[]; total: number }> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const values: unknown[] = [];
    let idx = 1;

    if (filter.search && filter.search.trim().length > 0) {
      conditions.push(`(name ILIKE $${idx} OR primary_muscles::text ILIKE $${idx})`);
      values.push(`%${filter.search.trim()}%`);
      idx++;
    }

    if (filter.muscle && filter.muscle.trim().length > 0) {
      conditions.push(`($${idx} = ANY(primary_muscles) OR $${idx} = ANY(secondary_muscles))`);
      values.push(filter.muscle.trim());
      idx++;
    }

    if (filter.category && filter.category.trim().length > 0) {
      conditions.push(`LOWER(category) = LOWER($${idx})`);
      values.push(filter.category.trim());
      idx++;
    }

    if (filter.equipment && filter.equipment.trim().length > 0) {
      conditions.push(`LOWER(equipment) = LOWER($${idx})`);
      values.push(filter.equipment.trim());
      idx++;
    }

    if (filter.difficulty && filter.difficulty.trim().length > 0) {
      conditions.push(`difficulty = $${idx}`);
      values.push(filter.difficulty.trim());
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM exercises WHERE ${whereClause}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const listQuery = `
      SELECT *
      FROM exercises
      WHERE ${whereClause}
      ORDER BY is_system DESC, name ASC
      OFFSET $${idx}
      LIMIT $${idx + 1}
    `;
    values.push(filter.offset, filter.limit);

    const res = await this.db.query<ExerciseRow>(listQuery, values);
    return {
      exercises: res.rows.map(toDomain),
      total,
    };
  }

  async create(exercise: Exercise): Promise<Exercise> {
    const res = await this.db.query<ExerciseRow>(
      `
      INSERT INTO exercises (
        id, name, description, instructions, tips, common_mistakes,
        primary_muscles, secondary_muscles, equipment, category, difficulty,
        is_compound, image_url, video_url, created_by, is_system,
        created_at, updated_at, deleted_at
      )
      VALUES (
        $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19
      )
      RETURNING *
      `,
      [
        exercise.id,
        exercise.name,
        exercise.description,
        JSON.stringify(exercise.instructions),
        JSON.stringify(exercise.tips),
        JSON.stringify(exercise.commonMistakes),
        exercise.primaryMuscles,
        exercise.secondaryMuscles,
        exercise.equipment,
        exercise.category,
        exercise.difficulty,
        exercise.isCompound,
        exercise.imageUrl,
        exercise.videoUrl,
        exercise.createdBy,
        exercise.isSystem,
        exercise.createdAt,
        exercise.updatedAt,
        exercise.deletedAt,
      ],
    );

    return toDomain(res.rows[0]!);
  }

  async update(id: string, patch: Partial<ExerciseProps>): Promise<Exercise | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated = new Exercise({
      id: existing.id,
      name: patch.name ?? existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      instructions: patch.instructions ?? [...existing.instructions],
      tips: patch.tips ?? [...existing.tips],
      commonMistakes: patch.commonMistakes ?? [...existing.commonMistakes],
      primaryMuscles: patch.primaryMuscles ?? [...existing.primaryMuscles],
      secondaryMuscles: patch.secondaryMuscles ?? [...existing.secondaryMuscles],
      equipment: patch.equipment ?? existing.equipment,
      category: patch.category ?? existing.category,
      difficulty: patch.difficulty ?? existing.difficulty,
      isCompound: patch.isCompound !== undefined ? patch.isCompound : existing.isCompound,
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
      videoUrl: patch.videoUrl !== undefined ? patch.videoUrl : existing.videoUrl,
      createdBy: existing.createdBy,
      isSystem: existing.isSystem,
      createdAt: existing.createdAt,
      updatedAt: patch.updatedAt ?? new Date(),
      deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : existing.deletedAt,
    });

    const res = await this.db.query<ExerciseRow>(
      `
      UPDATE exercises
      SET
        name = $2,
        description = $3,
        instructions = $4::jsonb,
        tips = $5::jsonb,
        common_mistakes = $6::jsonb,
        primary_muscles = $7,
        secondary_muscles = $8,
        equipment = $9,
        category = $10,
        difficulty = $11,
        is_compound = $12,
        image_url = $13,
        video_url = $14,
        updated_at = $15,
        deleted_at = $16
      WHERE id = $1
      RETURNING *
      `,
      [
        updated.id,
        updated.name,
        updated.description,
        JSON.stringify(updated.instructions),
        JSON.stringify(updated.tips),
        JSON.stringify(updated.commonMistakes),
        updated.primaryMuscles,
        updated.secondaryMuscles,
        updated.equipment,
        updated.category,
        updated.difficulty,
        updated.isCompound,
        updated.imageUrl,
        updated.videoUrl,
        updated.updatedAt,
        updated.deletedAt,
      ],
    );

    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE exercises SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async countAll(): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM exercises WHERE deleted_at IS NULL`,
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }
}
