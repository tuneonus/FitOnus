import { describe, expect, it, vi } from 'vitest';
import type { SqlExecutor } from '../../../src/database/transaction.js';
import { WeightLog } from '../../../src/modules/progress/domain/weight-log.js';
import { BodyMeasurement } from '../../../src/modules/progress/domain/body-measurement.js';
import { PgWeightRepository } from '../../../src/modules/progress/infrastructure/pg-weight-repository.js';
import { PgMeasurementRepository } from '../../../src/modules/progress/infrastructure/pg-measurement-repository.js';

function createMockDb(): SqlExecutor & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(),
  } as unknown as SqlExecutor & { query: ReturnType<typeof vi.fn> };
}

describe('PgWeightRepository Unit Tests', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const sampleLog = new WeightLog({
    id: 'a0000001-0000-4000-8000-000000000001',
    userId,
    weightKg: 78.5,
    loggedAt: new Date('2026-10-09T08:00:00Z'),
    source: 'manual',
    notes: 'Morning weigh-in',
    clientId: 'client-uuid-1',
  });

  const sampleRow = {
    id: sampleLog.id,
    user_id: sampleLog.userId,
    weight_kg: '78.50',
    logged_at: sampleLog.loggedAt,
    source: sampleLog.source,
    notes: sampleLog.notes,
    client_id: sampleLog.clientId,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  it('save inserts with ON CONFLICT (user_id, client_id) DO NOTHING and returns isNew: true on insert', async () => {
    const db = createMockDb();
    db.query.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

    const repo = new PgWeightRepository(db);
    const result = await repo.save(sampleLog);

    expect(result.isNew).toBe(true);
    expect(result.log.id).toBe(sampleLog.id);
    expect(result.log.weightKg).toBe(78.5);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (user_id, client_id) DO NOTHING'),
      expect.arrayContaining([sampleLog.id, sampleLog.userId, 78.5]),
    );
  });

  it('save handles conflict by returning existing record with isNew: false', async () => {
    const db = createMockDb();
    // First query (INSERT) conflicts and returns 0 rows
    db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Second query (findByClientId) returns the existing record
    db.query.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

    const repo = new PgWeightRepository(db);
    const result = await repo.save(sampleLog);

    expect(result.isNew).toBe(false);
    expect(result.log.id).toBe(sampleLog.id);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('findById enforces user isolation and ignores soft-deleted entries', async () => {
    const db = createMockDb();
    db.query.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

    const repo = new PgWeightRepository(db);
    const result = await repo.findById(sampleLog.id, userId);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(sampleLog.id);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL'),
      [sampleLog.id, userId],
    );
  });

  it('listForUser applies date filters and pagination', async () => {
    const db = createMockDb();
    db.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
    db.query.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

    const repo = new PgWeightRepository(db);
    const startDate = new Date('2026-10-01T00:00:00Z');
    const endDate = new Date('2026-10-15T00:00:00Z');
    const result = await repo.listForUser(userId, { startDate, endDate, offset: 10, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.logs.length).toBe(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT COUNT(*)::int AS count FROM weight_logs WHERE user_id = $1'),
      expect.arrayContaining([userId, startDate, endDate]),
    );
  });

  it('getUserWeightSummary fetches profile baseline weights and weight_logs stats', async () => {
    const db = createMockDb();
    db.query.mockResolvedValueOnce({
      rows: [
        {
          current_weight_kg: '78.5',
          starting_weight_kg: '84.2',
          target_weight_kg: '75.0',
          latest_logged_at: new Date('2026-10-09T08:00:00Z'),
          total_logs_count: '5',
        },
      ],
      rowCount: 1,
    });

    const repo = new PgWeightRepository(db);
    const summary = await repo.getUserWeightSummary(userId);

    expect(summary.currentWeightKg).toBe(78.5);
    expect(summary.startingWeightKg).toBe(84.2);
    expect(summary.targetWeightKg).toBe(75.0);
    expect(summary.totalLogsCount).toBe(5);
  });

  it('softDelete sets deleted_at with user ownership check', async () => {
    const db = createMockDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: sampleLog.id }], rowCount: 1 });

    const repo = new PgWeightRepository(db);
    const deleted = await repo.softDelete(sampleLog.id, userId);

    expect(deleted).toBe(true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+weight_logs\s+SET\s+deleted_at\s*=\s*NOW\(\)/),
      [sampleLog.id, userId],
    );
  });
});

describe('PgMeasurementRepository Unit Tests', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const sampleMeas = new BodyMeasurement({
    id: 'm0000001-0000-4000-8000-000000000001',
    userId,
    loggedAt: new Date('2026-10-09T08:00:00Z'),
    waistCm: 82.5,
    chestCm: 101.0,
    bodyFatPct: 15.5,
    clientId: 'client-m-1',
  });

  const sampleRow = {
    id: sampleMeas.id,
    user_id: sampleMeas.userId,
    logged_at: sampleMeas.loggedAt,
    waist_cm: '82.50',
    chest_cm: '101.00',
    hip_cm: null,
    arm_cm: null,
    neck_cm: null,
    body_fat_pct: '15.5',
    muscle_mass_kg: null,
    notes: null,
    source: sampleMeas.source,
    client_id: sampleMeas.clientId,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  it('save inserts with client_id idempotency', async () => {
    const db = createMockDb();
    db.query.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

    const repo = new PgMeasurementRepository(db);
    const res = await repo.save(sampleMeas);

    expect(res.isNew).toBe(true);
    expect(res.measurement.waistCm).toBe(82.5);
    expect(res.measurement.chestCm).toBe(101.0);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO body_measurements'),
      expect.arrayContaining([sampleMeas.id, sampleMeas.userId, 82.5, 101.0]),
    );
  });

  it('findById enforces user isolation', async () => {
    const db = createMockDb();
    db.query.mockResolvedValueOnce({ rows: [sampleRow], rowCount: 1 });

    const repo = new PgMeasurementRepository(db);
    const res = await repo.findById(sampleMeas.id, userId);

    expect(res).not.toBeNull();
    expect(res?.waistCm).toBe(82.5);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL'),
      [sampleMeas.id, userId],
    );
  });
});
