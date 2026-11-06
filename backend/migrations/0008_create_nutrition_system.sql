-- Migration 0008: Create Nutrition Tables (Foods, Meals, Meal Items, Water Intake, Favorites)

-- 0. Required Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Foods Catalog
-- Sourced from authoritative empirical databases (USDA FDC / verified labels)
-- Custom foods owned strictly by their creator (created_by)
CREATE TABLE foods (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  varchar(150)   NOT NULL,
  brand                 varchar(100),
  barcode               varchar(64),
  serving_size          numeric(8, 2)  NOT NULL CHECK (serving_size > 0),
  serving_unit          varchar(30)    NOT NULL DEFAULT 'g',
  serving_weight_g      numeric(8, 2)  NOT NULL CHECK (serving_weight_g > 0),
  serving_volume_ml     numeric(8, 2)  CHECK (serving_volume_ml > 0),
  density_g_per_ml      numeric(6, 4)  CHECK (density_g_per_ml > 0),
  serving_basis         varchar(20)    NOT NULL DEFAULT '100g' CHECK (serving_basis IN ('serving', '100g', '100ml')),
  calories              numeric(8, 2)  NOT NULL CHECK (calories >= 0),
  protein_g             numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbohydrates_g       numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (carbohydrates_g >= 0),
  fat_g                 numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  fiber_g               numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
  sugar_g               numeric(6, 2)  DEFAULT 0 CHECK (sugar_g >= 0),
  sodium_mg             numeric(8, 2)  DEFAULT 0 CHECK (sodium_mg >= 0),
  cholesterol_mg        numeric(6, 2)  DEFAULT 0 CHECK (cholesterol_mg >= 0),
  data_source           varchar(50)    NOT NULL DEFAULT 'usda_fdc' CHECK (data_source IN ('usda_fdc', 'open_food_facts', 'manufacturer_label', 'user_custom')),
  source_id             varchar(100),
  is_custom             boolean        NOT NULL DEFAULT false,
  is_verified           boolean        NOT NULL DEFAULT false,
  verification_status   varchar(20)    NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified', 'unverified', 'rejected')),
  created_by            uuid           REFERENCES users (id) ON DELETE CASCADE,
  created_at            timestamptz    NOT NULL DEFAULT now(),
  updated_at            timestamptz    NOT NULL DEFAULT now(),
  deleted_at            timestamptz,

  CONSTRAINT chk_food_ownership CHECK (
    (is_verified = true AND is_custom = false AND created_by IS NULL) OR
    (is_verified = false AND is_custom = true AND created_by IS NOT NULL) OR
    (is_verified = false AND is_custom = false AND created_by IS NOT NULL)
  )
);

CREATE INDEX idx_foods_name_trgm ON foods USING gin (name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_foods_name_lower ON foods (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_foods_created_by ON foods (created_by) WHERE created_by IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_foods_verified ON foods (is_verified) WHERE is_verified = true AND deleted_at IS NULL;

-- Verified foods have globally unique barcodes among active records
CREATE UNIQUE INDEX idx_foods_verified_active_barcode ON foods (barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL AND is_verified = true;

-- Custom foods have unique barcodes scoped per user (prevents barcode collision between users)
CREATE UNIQUE INDEX idx_foods_custom_user_barcode ON foods (created_by, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL AND is_verified = false;

-- 2. Meals Table (Header for daily logged meals)
CREATE TABLE meals (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  meal_type         varchar(20)    NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  date              date           NOT NULL,
  total_calories    numeric(8, 2)  NOT NULL DEFAULT 0 CHECK (total_calories >= 0),
  total_protein_g   numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (total_protein_g >= 0),
  total_carbs_g     numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (total_carbs_g >= 0),
  total_fat_g       numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (total_fat_g >= 0),
  total_fiber_g     numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (total_fiber_g >= 0),
  notes             text,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX idx_meals_user_date ON meals (user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_meals_user_type_date ON meals (user_id, meal_type, date) WHERE deleted_at IS NULL;

-- 3. Meal Items Table (Immutable historical snapshot)
-- Food values are frozen into the record so future food catalog changes do not alter historical nutrition
CREATE TABLE meal_items (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id             uuid           NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
  food_id             uuid           REFERENCES foods (id) ON DELETE SET NULL,
  food_name           varchar(150)   NOT NULL,
  food_brand          varchar(100),
  serving_size        numeric(8, 2)  NOT NULL CHECK (serving_size > 0),
  serving_unit        varchar(30)    NOT NULL,
  serving_weight_g    numeric(8, 2)  NOT NULL CHECK (serving_weight_g > 0),
  serving_multiplier  numeric(6, 2)  NOT NULL DEFAULT 1.0 CHECK (serving_multiplier > 0),
  logged_weight_g     numeric(8, 2)  NOT NULL CHECK (logged_weight_g > 0),
  calories            numeric(8, 2)  NOT NULL CHECK (calories >= 0),
  protein_g           numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g             numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g               numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  fiber_g             numeric(6, 2)  NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
  created_at          timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_meal_items_meal ON meal_items (meal_id);
CREATE INDEX idx_meal_items_food ON meal_items (food_id);

-- 4. Water Intake Table
CREATE TABLE water_intake (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date        date         NOT NULL,
  amount_ml   integer      NOT NULL CHECK (amount_ml > 0),
  logged_at   timestamptz  NOT NULL DEFAULT now(),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_water_intake_user_date ON water_intake (user_id, date DESC);

-- 5. Food Favorites (User bookmarks)
CREATE TABLE food_favorites (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  food_id     uuid         NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_food_favorite UNIQUE (user_id, food_id)
);

CREATE INDEX idx_food_favorites_user ON food_favorites (user_id);
