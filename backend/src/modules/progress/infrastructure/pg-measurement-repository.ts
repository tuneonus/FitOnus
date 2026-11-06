import type { SqlExecutor } from '../../../database/transaction.js';
import type { IBodyMeasurementRepository, MeasurementFilter } from '../application/ports.js';
import { BodyMeasurement, type MeasurementSource } from '../domain/body-measurement.js';

interface MeasurementRow {
  id: string;
  user_id: string;
  logged_at: Date;
  waist_cm: string | number | null;
  chest_cm: string | number | null;
  hip_cm: string | number | null;
  arm_cm: string | number | null;
  neck_cm: string | number | null;
  body_fat_pct: string | number | null;
  muscle_mass_kg: string | number | null;
  notes: string | null;
  source: MeasurementSource;
  client_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function parseNullableNumber(val: string | number | null): number | null {
  if (val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

function toDomain(row: MeasurementRow): BodyMeasurement {
  return new BodyMeasurement({
    id: row.id,
    userId: row.user_id,
    loggedAt: row.logged_at,
    waistCm: parseNullableNumber(row.waist_cm),
    chestCm: parseNullableNumber(row.chest_cm),
    hipCm: parseNullableNumber(row.hip_cm),
    armCm: parseNullableNumber(row.arm_cm),
    neckCm: parseNullableNumber(row.neck_cm),
    bodyFatPct: parseNullableNumber(row.body_fat_pct),
    muscleMassKg: parseNullableNumber(row.muscle_mass_kg),
    notes: row.notes,
    source: row.source,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
}

export class PgMeasurementRepository implements IBodyMeasurementRepository {
  constructor(private readonly db: SqlExecutor) {}

  async save(measurement: BodyMeasurement): Promise<{ measurement: BodyMeasurement; isNew: boolean }> {
    if (measurement.clientId) {
      const insertQuery = `
        INSERT INTO body_measurements (
          id, user_id, logged_at, waist_cm, chest_cm, hip_cm, arm_cm, neck_cm,
          body_fat_pct, muscle_mass_kg, notes, source, client_id, created_at, updated_at, deleted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING *;
      `;
      const res = await this.db.query<MeasurementRow>(insertQuery, [
        measurement.id,
        measurement.userId,
        measurement.loggedAt,
        measurement.waistCm,
        measurement.chestCm,
        measurement.hipCm,
        measurement.armCm,
        measurement.neckCm,
        measurement.bodyFatPct,
        measurement.muscleMassKg,
        measurement.notes,
        measurement.source,
        measurement.clientId,
        measurement.createdAt,
        measurement.updatedAt,
        measurement.deletedAt,
      ]);

      if (res.rows.length > 0) {
        return { measurement: toDomain(res.rows[0]!), isNew: true };
      }

      // Conflict occurred on (user_id, client_id); retrieve existing record
      const existing = await this.findByClientId(measurement.clientId, measurement.userId);
      if (existing) {
        return { measurement: existing, isNew: false };
      }
    }

    // No client_id, or updating by primary key
    const upsertQuery = `
      INSERT INTO body_measurements (
        id, user_id, logged_at, waist_cm, chest_cm, hip_cm, arm_cm, neck_cm,
        body_fat_pct, muscle_mass_kg, notes, source, client_id, created_at, updated_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        logged_at = EXCLUDED.logged_at,
        waist_cm = EXCLUDED.waist_cm,
        chest_cm = EXCLUDED.chest_cm,
        hip_cm = EXCLUDED.hip_cm,
        arm_cm = EXCLUDED.arm_cm,
        neck_cm = EXCLUDED.neck_cm,
        body_fat_pct = EXCLUDED.body_fat_pct,
        muscle_mass_kg = EXCLUDED.muscle_mass_kg,
        notes = EXCLUDED.notes,
        source = EXCLUDED.source,
        updated_at = NOW(),
        deleted_at = EXCLUDED.deleted_at
      RETURNING *;
    `;
    const res = await this.db.query<MeasurementRow>(upsertQuery, [
      measurement.id,
      measurement.userId,
      measurement.loggedAt,
      measurement.waistCm,
      measurement.chestCm,
      measurement.hipCm,
      measurement.armCm,
      measurement.neckCm,
      measurement.bodyFatPct,
      measurement.muscleMassKg,
      measurement.notes,
      measurement.source,
      measurement.clientId,
      measurement.createdAt,
      measurement.updatedAt,
      measurement.deletedAt,
    ]);

    return { measurement: toDomain(res.rows[0]!), isNew: true };
  }

  async update(
    id: string,
    userId: string,
    patch: Partial<import('../domain/body-measurement.js').BodyMeasurementProps>,
  ): Promise<BodyMeasurement | null> {
    const existing = await this.findById(id, userId);
    if (!existing) return null;

    const updatedMeas = new BodyMeasurement({
      id: existing.id,
      userId: existing.userId,
      loggedAt: patch.loggedAt ?? existing.loggedAt,
      waistCm: patch.waistCm !== undefined ? patch.waistCm : existing.waistCm,
      chestCm: patch.chestCm !== undefined ? patch.chestCm : existing.chestCm,
      hipCm: patch.hipCm !== undefined ? patch.hipCm : existing.hipCm,
      armCm: patch.armCm !== undefined ? patch.armCm : existing.armCm,
      neckCm: patch.neckCm !== undefined ? patch.neckCm : existing.neckCm,
      bodyFatPct: patch.bodyFatPct !== undefined ? patch.bodyFatPct : existing.bodyFatPct,
      muscleMassKg: patch.muscleMassKg !== undefined ? patch.muscleMassKg : existing.muscleMassKg,
      notes: patch.notes !== undefined ? patch.notes : existing.notes,
      source: patch.source ?? existing.source,
      clientId: existing.clientId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
      deletedAt: existing.deletedAt,
    });

    const query = `
      UPDATE body_measurements
      SET logged_at = $1, waist_cm = $2, chest_cm = $3, hip_cm = $4, arm_cm = $5,
          neck_cm = $6, body_fat_pct = $7, muscle_mass_kg = $8, notes = $9, source = $10, updated_at = NOW()
      WHERE id = $11 AND user_id = $12 AND deleted_at IS NULL
      RETURNING *;
    `;
    const res = await this.db.query<MeasurementRow>(query, [
      updatedMeas.loggedAt,
      updatedMeas.waistCm,
      updatedMeas.chestCm,
      updatedMeas.hipCm,
      updatedMeas.armCm,
      updatedMeas.neckCm,
      updatedMeas.bodyFatPct,
      updatedMeas.muscleMassKg,
      updatedMeas.notes,
      updatedMeas.source,
      id,
      userId,
    ]);

    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async findById(id: string, userId: string): Promise<BodyMeasurement | null> {
    const res = await this.db.query<MeasurementRow>(
      `SELECT * FROM body_measurements WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [id, userId],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async findByClientId(clientId: string, userId: string): Promise<BodyMeasurement | null> {
    const res = await this.db.query<MeasurementRow>(
      `SELECT * FROM body_measurements WHERE client_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [clientId, userId],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async listForUser(
    userId: string,
    filter?: MeasurementFilter,
  ): Promise<{ measurements: BodyMeasurement[]; total: number }> {
    const conditions: string[] = ['user_id = $1'];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (!filter?.includeDeleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (filter?.startDate) {
      conditions.push(`logged_at >= $${paramIndex++}`);
      values.push(filter.startDate);
    }

    if (filter?.endDate) {
      conditions.push(`logged_at <= $${paramIndex++}`);
      values.push(filter.endDate);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM body_measurements WHERE ${whereClause}`,
      values,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);

    const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 500);
    const offset = Math.max(filter?.offset ?? 0, 0);

    const dataQuery = `
      SELECT * FROM body_measurements 
      WHERE ${whereClause}
      ORDER BY logged_at DESC, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    const dataValues = [...values, limit, offset];

    const dataRes = await this.db.query<MeasurementRow>(dataQuery, dataValues);
    return {
      measurements: dataRes.rows.map(toDomain),
      total,
    };
  }

  async getLatestForUser(userId: string): Promise<BodyMeasurement | null> {
    const res = await this.db.query<MeasurementRow>(
      `SELECT * FROM body_measurements 
       WHERE user_id = $1 AND deleted_at IS NULL 
       ORDER BY logged_at DESC, created_at DESC 
       LIMIT 1`,
      [userId],
    );
    return res.rows[0] ? toDomain(res.rows[0]) : null;
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `UPDATE body_measurements 
       SET deleted_at = NOW(), updated_at = NOW() 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL 
       RETURNING id`,
      [id, userId],
    );
    return res.rows.length > 0;
  }
}
