import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMigrations } from '../../../src/database/migration-runner.js';
import { MIGRATIONS_DIR } from '../../helpers/test-database.js';

describe('Progress & Measurements Migration 0009', () => {
  it('loads migration 0009 with valid version and transactional mode', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const m0009 = migrations.find((m) => m.version === 9);

    expect(m0009).toBeDefined();
    expect(m0009?.name).toBe('create_progress_and_measurements');
    expect(m0009?.transactional).toBe(true);
  });

  it('contains weight_logs schema with strict constraints and idempotency', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0009_create_progress_and_measurements.sql');
    const sql = await readFile(filePath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS weight_logs (');
    expect(sql).toContain('user_id       uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE');
    expect(sql).toContain('weight_kg     numeric(5, 2)  NOT NULL CHECK (weight_kg >= 25.0 AND weight_kg <= 450.0)');
    expect(sql).toContain('logged_at     timestamptz    NOT NULL');
    expect(sql).toContain("source        varchar(20)    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'synced'))");
    expect(sql).toContain('client_id     varchar(64)');
    expect(sql).toContain('CONSTRAINT uq_weight_logs_user_client_id UNIQUE (user_id, client_id)');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_weight_logs_user_logged');
  });

  it('contains body_measurements schema with ranges and at-least-one constraint', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0009_create_progress_and_measurements.sql');
    const sql = await readFile(filePath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS body_measurements (');
    expect(sql).toContain('user_id         uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE');
    expect(sql).toContain('waist_cm        numeric(5, 2)  CHECK (waist_cm > 30.0 AND waist_cm < 250.0)');
    expect(sql).toContain('chest_cm        numeric(5, 2)  CHECK (chest_cm > 30.0 AND chest_cm < 250.0)');
    expect(sql).toContain('hip_cm          numeric(5, 2)  CHECK (hip_cm > 30.0 AND hip_cm < 250.0)');
    expect(sql).toContain('arm_cm          numeric(5, 2)  CHECK (arm_cm > 10.0 AND arm_cm < 100.0)');
    expect(sql).toContain('neck_cm         numeric(5, 2)  CHECK (neck_cm > 15.0 AND neck_cm < 80.0)');
    expect(sql).toContain('body_fat_pct    numeric(4, 1)  CHECK (body_fat_pct >= 3.0 AND body_fat_pct <= 60.0)');
    expect(sql).toContain('muscle_mass_kg  numeric(5, 2)  CHECK (muscle_mass_kg >= 10.0 AND muscle_mass_kg <= 200.0)');
    expect(sql).toContain('CONSTRAINT uq_body_measurements_user_client_id UNIQUE (user_id, client_id)');
    expect(sql).toContain('CONSTRAINT chk_at_least_one_measurement CHECK');
  });

  it('preserves starting_weight_kg separately from current_weight_kg', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0009_create_progress_and_measurements.sql');
    const sql = await readFile(filePath, 'utf8');

    expect(sql).toContain('ALTER TABLE user_profiles');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS starting_weight_kg numeric(5, 1)');
    expect(sql).toContain('user_profiles_starting_weight_valid');
  });

  it('implements concurrency-safe profile weight synchronization trigger', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0009_create_progress_and_measurements.sql');
    const sql = await readFile(filePath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION sync_profile_current_weight()');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('ORDER BY logged_at DESC, created_at DESC');
    expect(sql).toContain('CREATE TRIGGER trg_sync_profile_weight');
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON weight_logs');
  });
});
