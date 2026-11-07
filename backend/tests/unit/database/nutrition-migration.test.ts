import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMigrations } from '../../../src/database/migration-runner.js';
import { MIGRATIONS_DIR } from '../../helpers/test-database.js';
import { VERIFIED_FOODS } from '../../../scripts/seed-foods.js';

const RFC4122_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Nutrition Migration 0008', () => {
  it('loads migration 0008 with valid version and transactional mode', async () => {
    const migrations = await loadMigrations(MIGRATIONS_DIR);
    const m0008 = migrations.find((m) => m.version === 8);

    expect(m0008).toBeDefined();
    expect(m0008?.name).toBe('create_nutrition_system');
    expect(m0008?.transactional).toBe(true);
  });

  it('contains the five approved tables with expected schema definitions', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0008_create_nutrition_system.sql');
    const sql = await readFile(filePath, 'utf8');

    // 1. Foods Table
    expect(sql).toContain('CREATE TABLE foods (');
    expect(sql).toContain('serving_basis');
    expect(sql).toContain('serving_weight_g      numeric(8, 2)  NOT NULL CHECK (serving_weight_g > 0)');
    expect(sql).toContain('density_g_per_ml      numeric(6, 4)  CHECK (density_g_per_ml > 0)');
    expect(sql).toContain('data_source');
    expect(sql).toContain('source_id');
    expect(sql).toContain('chk_food_ownership CHECK');

    // 2. Meals Table
    expect(sql).toContain('CREATE TABLE meals (');
    expect(sql).toContain(
      "meal_type         varchar(20)    NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack'))",
    );
    expect(sql).toContain('total_calories');
    expect(sql).toContain('total_protein_g');

    // 3. Meal Items Table
    expect(sql).toContain('CREATE TABLE meal_items (');
    expect(sql).toContain('food_id             uuid           REFERENCES foods (id) ON DELETE SET NULL');
    expect(sql).toContain('serving_weight_g    numeric(8, 2)  NOT NULL CHECK (serving_weight_g > 0)');
    expect(sql).toContain(
      'serving_multiplier  numeric(6, 2)  NOT NULL DEFAULT 1.0 CHECK (serving_multiplier > 0)',
    );
    expect(sql).toContain('logged_weight_g     numeric(8, 2)  NOT NULL CHECK (logged_weight_g > 0)');
    expect(sql).toContain('protein_g');

    // 4. Water Intake Table
    expect(sql).toContain('CREATE TABLE water_intake (');
    expect(sql).toContain('amount_ml   integer      NOT NULL CHECK (amount_ml > 0)');

    // 5. Food Favorites Table
    expect(sql).toContain('CREATE TABLE food_favorites (');
    expect(sql).toContain('CONSTRAINT uq_user_food_favorite UNIQUE (user_id, food_id)');
  });

  it('contains critical indexes for search, barcodes, and performance', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0008_create_nutrition_system.sql');
    const sql = await readFile(filePath, 'utf8');

    expect(sql).toContain('CREATE INDEX idx_foods_name_trgm ON foods USING gin');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_foods_verified_active_barcode ON foods');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_foods_custom_user_barcode ON foods');
    expect(sql).toContain('CREATE INDEX idx_meals_user_date ON meals');
    expect(sql).toContain('CREATE INDEX idx_water_intake_user_date ON water_intake');
  });

  it('enforces that custom foods cannot exist without an owner', async () => {
    const filePath = path.join(MIGRATIONS_DIR, '0008_create_nutrition_system.sql');
    const sql = await readFile(filePath, 'utf8');

    // Foreign key deletes custom foods when user is deleted
    expect(sql).toContain('created_by            uuid           REFERENCES users (id) ON DELETE CASCADE');
    // Check constraint requires created_by IS NOT NULL for custom foods
    expect(sql).toContain('(is_verified = false AND is_custom = true AND created_by IS NOT NULL)');
    // System foods must have created_by IS NULL
    expect(sql).toContain('(is_verified = true AND is_custom = false AND created_by IS NULL)');
  });
});

describe('Verified Seed Foods Catalog', () => {
  it('contains exactly 25 independently verified foods', () => {
    expect(VERIFIED_FOODS.length).toBe(25);
  });

  it('every seed food complies with RFC 4122 v4 UUID format', () => {
    for (const food of VERIFIED_FOODS) {
      expect(food.id).toMatch(RFC4122_V4_REGEX);
    }
  });

  it('every seed food has authentic USDA FDC provenance and verification status', () => {
    for (const food of VERIFIED_FOODS) {
      expect(food.dataSource).toBe('usda_fdc');
      expect(food.sourceId).toBeTruthy();
      expect(typeof food.sourceId).toBe('string');
      expect(food.isVerified).toBe(true);
      expect(food.isCustom).toBe(false);
      expect(food.verificationStatus).toBe('verified');
      expect(food.servingBasis).toBe('100g');
    }
  });

  it('all macronutrients and measurements are valid, non-negative numbers', () => {
    for (const food of VERIFIED_FOODS) {
      expect(food.servingSize).toBeGreaterThan(0);
      expect(food.servingWeightG).toBeGreaterThan(0);
      expect(food.calories).toBeGreaterThanOrEqual(0);
      expect(food.proteinG).toBeGreaterThanOrEqual(0);
      expect(food.carbohydratesG).toBeGreaterThanOrEqual(0);
      expect(food.fatG).toBeGreaterThanOrEqual(0);
      expect(food.fiberG).toBeGreaterThanOrEqual(0);
      expect(food.sugarG).toBeGreaterThanOrEqual(0);
      expect(food.sodiumMg).toBeGreaterThanOrEqual(0);
      expect(food.cholesterolMg).toBeGreaterThanOrEqual(0);
    }
  });

  it('contains unique IDs and unique USDA source IDs across all seed foods', () => {
    const ids = VERIFIED_FOODS.map((f) => f.id);
    const sourceIds = VERIFIED_FOODS.map((f) => f.sourceId);

    expect(new Set(ids).size).toBe(VERIFIED_FOODS.length);
    expect(new Set(sourceIds).size).toBe(VERIFIED_FOODS.length);
  });
});
