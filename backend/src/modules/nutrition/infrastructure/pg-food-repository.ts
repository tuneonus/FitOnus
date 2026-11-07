import type { SqlExecutor } from '../../../database/transaction.js';
import {
  Food,
  type FoodDataSource,
  type FoodProps,
  type ServingBasis,
  type VerificationStatus,
} from '../domain/food.js';
import type { FoodSearchFilter, IFoodRepository, NutritionCatalogStats } from '../application/ports.js';

interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_size: string | number;
  serving_unit: string;
  serving_weight_g: string | number;
  serving_volume_ml: string | number | null;
  density_g_per_ml: string | number | null;
  serving_basis: ServingBasis;
  calories: string | number;
  protein_g: string | number;
  carbohydrates_g: string | number;
  fat_g: string | number;
  fiber_g: string | number;
  sugar_g: string | number | null;
  sodium_mg: string | number | null;
  cholesterol_mg: string | number | null;
  data_source: FoodDataSource;
  source_id: string | null;
  is_custom: boolean;
  is_verified: boolean;
  verification_status: VerificationStatus;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const SELECT_COLUMNS = `
  id, name, brand, barcode, serving_size, serving_unit,
  serving_weight_g, serving_volume_ml, density_g_per_ml,
  serving_basis, calories, protein_g, carbohydrates_g,
  fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg,
  data_source, source_id, is_custom, is_verified,
  verification_status, created_by, created_at, updated_at, deleted_at
`;

function toDomain(row: FoodRow): Food {
  return new Food({
    id: row.id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    servingSize: Number(row.serving_size),
    servingUnit: row.serving_unit,
    servingWeightG: Number(row.serving_weight_g),
    servingVolumeMl: row.serving_volume_ml !== null ? Number(row.serving_volume_ml) : null,
    densityGPerMl: row.density_g_per_ml !== null ? Number(row.density_g_per_ml) : null,
    servingBasis: row.serving_basis,
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbohydratesG: Number(row.carbohydrates_g),
    fatG: Number(row.fat_g),
    fiberG: Number(row.fiber_g),
    sugarG: row.sugar_g !== null ? Number(row.sugar_g) : 0,
    sodiumMg: row.sodium_mg !== null ? Number(row.sodium_mg) : 0,
    cholesterolMg: row.cholesterol_mg !== null ? Number(row.cholesterol_mg) : 0,
    dataSource: row.data_source,
    sourceId: row.source_id,
    isCustom: row.is_custom,
    isVerified: row.is_verified,
    verificationStatus: row.verification_status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgFoodRepository implements IFoodRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(
    id: string,
    requestingUserId?: string | null,
    includeDeleted: boolean = false,
  ): Promise<Food | null> {
    const conditions = ['id = $1'];
    const values: unknown[] = [id];

    if (!includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (requestingUserId !== undefined) {
      if (requestingUserId !== null) {
        conditions.push('(is_verified = true OR created_by = $2)');
        values.push(requestingUserId);
      } else {
        conditions.push('is_verified = true');
      }
    }

    const res = await this.db.query<FoodRow>(
      `SELECT ${SELECT_COLUMNS} FROM foods WHERE ${conditions.join(' AND ')} LIMIT 1`,
      values,
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async findByBarcode(barcode: string, requestingUserId?: string | null): Promise<Food | null> {
    const trimmed = barcode.trim();
    const conditions = ['barcode = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [trimmed];

    if (requestingUserId !== undefined) {
      if (requestingUserId !== null) {
        conditions.push('(is_verified = true OR created_by = $2)');
        values.push(requestingUserId);
      } else {
        conditions.push('is_verified = true');
      }
    }

    // Verified catalog foods take precedence over user custom foods with same barcode
    const res = await this.db.query<FoodRow>(
      `SELECT ${SELECT_COLUMNS} FROM foods WHERE ${conditions.join(' AND ')} ORDER BY is_verified DESC LIMIT 1`,
      values,
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async search(filter: FoodSearchFilter): Promise<{ foods: Food[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (!filter.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (filter.isVerifiedOnly) {
      conditions.push('is_verified = true');
    } else if (filter.userId !== undefined && filter.userId !== null) {
      conditions.push(`(is_verified = true OR created_by = $${idx++})`);
      values.push(filter.userId);
    } else if (
      filter.userId === undefined &&
      filter.isCustom === undefined &&
      filter.dataSource === undefined &&
      filter.verificationStatus === undefined
    ) {
      // Default member fallback: verified only
      conditions.push('is_verified = true');
    }

    if (filter.isCustom !== undefined) {
      conditions.push(`is_custom = $${idx++}`);
      values.push(filter.isCustom);
    }

    if (filter.dataSource !== undefined) {
      conditions.push(`data_source = $${idx++}`);
      values.push(filter.dataSource);
    }

    if (filter.verificationStatus !== undefined) {
      conditions.push(`verification_status = $${idx++}`);
      values.push(filter.verificationStatus);
    }

    if (filter.query && filter.query.trim().length > 0) {
      const q = filter.query.trim();
      conditions.push(`(name ILIKE $${idx} OR (brand IS NOT NULL AND brand ILIKE $${idx}))`);
      values.push(`%${q}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? conditions.join(' AND ') : 'TRUE';

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM foods WHERE ${whereClause}`,
      values,
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const query = `
      SELECT ${SELECT_COLUMNS}
      FROM foods
      WHERE ${whereClause}
      ORDER BY is_verified DESC, name ASC
      OFFSET $${idx++}
      LIMIT $${idx}
    `;
    const queryValues = [...values, filter.offset, filter.limit];

    const rowsRes = await this.db.query<FoodRow>(query, queryValues);
    return {
      foods: rowsRes.rows.map(toDomain),
      total,
    };
  }

  async listRecent(userId: string, limit: number): Promise<Food[]> {
    const query = `
      SELECT DISTINCT ON (f.id) ${SELECT_COLUMNS.split(',')
        .map((c) => `f.${c.trim()}`)
        .join(', ')}
      FROM meal_items mi
      JOIN meals m ON mi.meal_id = m.id
      JOIN foods f ON mi.food_id = f.id
      WHERE m.user_id = $1
        AND m.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND (f.is_verified = true OR f.created_by = $1)
      ORDER BY f.id, mi.created_at DESC
      LIMIT $2
    `;
    const res = await this.db.query<FoodRow>(query, [userId, limit]);
    return res.rows.map(toDomain);
  }

  async listFavorites(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<{ foods: Food[]; total: number }> {
    const countRes = await this.db.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM food_favorites ff
      JOIN foods f ON ff.food_id = f.id
      WHERE ff.user_id = $1
        AND f.deleted_at IS NULL
        AND (f.is_verified = true OR f.created_by = $1)
      `,
      [userId],
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const query = `
      SELECT ${SELECT_COLUMNS.split(',')
        .map((c) => `f.${c.trim()}`)
        .join(', ')}
      FROM food_favorites ff
      JOIN foods f ON ff.food_id = f.id
      WHERE ff.user_id = $1
        AND f.deleted_at IS NULL
        AND (f.is_verified = true OR f.created_by = $1)
      ORDER BY ff.created_at DESC
      OFFSET $2
      LIMIT $3
    `;
    const res = await this.db.query<FoodRow>(query, [userId, offset, limit]);
    return {
      foods: res.rows.map(toDomain),
      total,
    };
  }

  async create(food: Food): Promise<Food> {
    const query = `
      INSERT INTO foods (
        id, name, brand, barcode, serving_size, serving_unit,
        serving_weight_g, serving_volume_ml, density_g_per_ml,
        serving_basis, calories, protein_g, carbohydrates_g,
        fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg,
        data_source, source_id, is_custom, is_verified,
        verification_status, created_by, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26
      )
      RETURNING ${SELECT_COLUMNS}
    `;
    const values = [
      food.id,
      food.name,
      food.brand,
      food.barcode,
      food.servingSize,
      food.servingUnit,
      food.servingWeightG,
      food.servingVolumeMl,
      food.densityGPerMl,
      food.servingBasis,
      food.calories,
      food.proteinG,
      food.carbohydratesG,
      food.fatG,
      food.fiberG,
      food.sugarG,
      food.sodiumMg,
      food.cholesterolMg,
      food.dataSource,
      food.sourceId,
      food.isCustom,
      food.isVerified,
      food.verificationStatus,
      food.createdBy,
      food.createdAt,
      food.updatedAt,
    ];
    const res = await this.db.query<FoodRow>(query, values);
    return toDomain(res.rows[0]!);
  }

  async update(id: string, patch: Partial<FoodProps>, updatingUserId?: string | null): Promise<Food | null> {
    const existing = await this.findById(id, updatingUserId);
    if (!existing) return null;

    // Strict ownership enforcement:
    // If an authenticated member updates, they can only edit their own custom foods
    if (updatingUserId && (!existing.isCustom || existing.createdBy !== updatingUserId)) {
      throw new Error('Unauthorized: cannot edit foods owned by another user or system verified catalog');
    }

    const fields: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [id];
    let idx = 2;

    if (patch.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(patch.name.trim());
    }
    if (patch.brand !== undefined) {
      fields.push(`brand = $${idx++}`);
      values.push(patch.brand ? patch.brand.trim() : null);
    }
    if (patch.barcode !== undefined) {
      fields.push(`barcode = $${idx++}`);
      values.push(patch.barcode ? patch.barcode.trim() : null);
    }
    if (patch.servingSize !== undefined) {
      fields.push(`serving_size = $${idx++}`);
      values.push(patch.servingSize);
    }
    if (patch.servingUnit !== undefined) {
      fields.push(`serving_unit = $${idx++}`);
      values.push(patch.servingUnit.trim());
    }
    if (patch.servingWeightG !== undefined) {
      fields.push(`serving_weight_g = $${idx++}`);
      values.push(patch.servingWeightG);
    }
    if (patch.servingVolumeMl !== undefined) {
      fields.push(`serving_volume_ml = $${idx++}`);
      values.push(patch.servingVolumeMl);
    }
    if (patch.densityGPerMl !== undefined) {
      fields.push(`density_g_per_ml = $${idx++}`);
      values.push(patch.densityGPerMl);
    }
    if (patch.calories !== undefined) {
      fields.push(`calories = $${idx++}`);
      values.push(patch.calories);
    }
    if (patch.proteinG !== undefined) {
      fields.push(`protein_g = $${idx++}`);
      values.push(patch.proteinG);
    }
    if (patch.carbohydratesG !== undefined) {
      fields.push(`carbohydrates_g = $${idx++}`);
      values.push(patch.carbohydratesG);
    }
    if (patch.fatG !== undefined) {
      fields.push(`fat_g = $${idx++}`);
      values.push(patch.fatG);
    }
    if (patch.fiberG !== undefined) {
      fields.push(`fiber_g = $${idx++}`);
      values.push(patch.fiberG);
    }
    if (patch.sugarG !== undefined) {
      fields.push(`sugar_g = $${idx++}`);
      values.push(patch.sugarG);
    }
    if (patch.sodiumMg !== undefined) {
      fields.push(`sodium_mg = $${idx++}`);
      values.push(patch.sodiumMg);
    }
    if (patch.cholesterolMg !== undefined) {
      fields.push(`cholesterol_mg = $${idx++}`);
      values.push(patch.cholesterolMg);
    }
    if (patch.isVerified !== undefined && !updatingUserId) {
      // Admin only
      fields.push(`is_verified = $${idx++}`);
      values.push(patch.isVerified);
    }
    if (patch.verificationStatus !== undefined && !updatingUserId) {
      // Admin only
      fields.push(`verification_status = $${idx++}`);
      values.push(patch.verificationStatus);
    }
    if (patch.dataSource !== undefined && !updatingUserId) {
      // Admin only
      fields.push(`data_source = $${idx++}`);
      values.push(patch.dataSource);
    }
    if (patch.sourceId !== undefined && !updatingUserId) {
      // Admin only
      fields.push(`source_id = $${idx++}`);
      values.push(patch.sourceId ? patch.sourceId.trim() : null);
    }
    if (patch.isCustom !== undefined && !updatingUserId) {
      // Admin only
      fields.push(`is_custom = $${idx++}`);
      values.push(patch.isCustom);
    }
    if (patch.createdBy !== undefined && !updatingUserId) {
      // Admin only
      fields.push(`created_by = $${idx++}`);
      values.push(patch.createdBy);
    }

    const whereConditions = ['id = $1', 'deleted_at IS NULL'];
    if (updatingUserId) {
      whereConditions.push(`created_by = $${idx}`);
      values.push(updatingUserId);
    }

    const query = `
      UPDATE foods
      SET ${fields.join(', ')}
      WHERE ${whereConditions.join(' AND ')}
      RETURNING ${SELECT_COLUMNS}
    `;
    const res = await this.db.query<FoodRow>(query, values);
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async softDelete(id: string, deletingUserId?: string | null): Promise<boolean> {
    const whereConditions = ['id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [id];

    if (deletingUserId) {
      whereConditions.push('created_by = $2 AND is_verified = false');
      values.push(deletingUserId);
    }

    const res = await this.db.query(
      `UPDATE foods SET deleted_at = NOW(), updated_at = NOW() WHERE ${whereConditions.join(' AND ')}`,
      values,
    );
    return (res.rowCount ?? 0) > 0;
  }

  async countVerified(): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM foods WHERE is_verified = true AND deleted_at IS NULL`,
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  async countCustom(userId?: string): Promise<number> {
    let query = `SELECT COUNT(*)::text AS count FROM foods WHERE is_custom = true AND deleted_at IS NULL`;
    const values: unknown[] = [];
    if (userId) {
      query += ` AND created_by = $1`;
      values.push(userId);
    }
    const res = await this.db.query<{ count: string }>(query, values);
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  async getCatalogStats(): Promise<NutritionCatalogStats> {
    const statsRes = await this.db.query<{
      verified_foods: string;
      custom_foods: string;
      meals_logged: string;
      meal_items_logged: string;
      water_logs: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM foods WHERE is_verified = true AND deleted_at IS NULL)::text AS verified_foods,
        (SELECT COUNT(*) FROM foods WHERE is_custom = true AND deleted_at IS NULL)::text AS custom_foods,
        (SELECT COUNT(*) FROM meals WHERE deleted_at IS NULL)::text AS meals_logged,
        (SELECT COUNT(*) FROM meal_items mi JOIN meals m ON mi.meal_id = m.id WHERE m.deleted_at IS NULL)::text AS meal_items_logged,
        (SELECT COUNT(*) FROM water_intake)::text AS water_logs
    `);

    const sourcesRes = await this.db.query<{ data_source: string; count: string }>(`
      SELECT data_source, COUNT(*)::text AS count
      FROM foods
      WHERE is_verified = true AND deleted_at IS NULL
      GROUP BY data_source
      ORDER BY count DESC
    `);

    const row = statsRes.rows[0];
    const verifiedFoodsBySource: Record<string, number> = {};
    for (const s of sourcesRes.rows) {
      verifiedFoodsBySource[s.data_source] = parseInt(s.count, 10);
    }

    return {
      totalVerifiedFoods: parseInt(row?.verified_foods ?? '0', 10),
      totalCustomFoods: parseInt(row?.custom_foods ?? '0', 10),
      totalMealsLogged: parseInt(row?.meals_logged ?? '0', 10),
      totalMealItemsLogged: parseInt(row?.meal_items_logged ?? '0', 10),
      totalWaterLogs: parseInt(row?.water_logs ?? '0', 10),
      verifiedFoodsBySource,
    };
  }
}
