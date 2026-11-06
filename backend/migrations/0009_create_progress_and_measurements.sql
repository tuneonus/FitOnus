-- Migration 0009: Create Weight Tracking, Body Measurements, and Profile Weight Synchronization
-- Strictly scoped to Phase 5: Progress Tracking & Analytics foundation.
-- Primary keys use RFC 4122 v4 UUIDs generated via gen_random_uuid().

-- ============================================================================
-- 1. Extend user_profiles with persistent starting_weight_kg
-- ============================================================================
-- Preserves the historical baseline onboarding/initial weight separately from current_weight_kg.
-- Never overwritten by daily weight progression.
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS starting_weight_kg numeric(5, 1);

-- Backfill starting_weight_kg from existing current_weight_kg if present
UPDATE user_profiles 
SET starting_weight_kg = current_weight_kg 
WHERE starting_weight_kg IS NULL AND current_weight_kg IS NOT NULL;

-- Enforce valid range constraint on starting_weight_kg
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_starting_weight_valid'
  ) THEN
    ALTER TABLE user_profiles 
    ADD CONSTRAINT user_profiles_starting_weight_valid 
    CHECK (starting_weight_kg IS NULL OR (starting_weight_kg >= 25.0 AND starting_weight_kg <= 450.0));
  END IF;
END $$;

-- ============================================================================
-- 2. Historical Body Weight Logs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS weight_logs (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  weight_kg     numeric(5, 2)  NOT NULL CHECK (weight_kg >= 25.0 AND weight_kg <= 450.0),
  logged_at     timestamptz    NOT NULL,
  source        varchar(20)    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'synced')),
  notes         text,
  client_id     varchar(64),
  created_at    timestamptz    NOT NULL DEFAULT now(),
  updated_at    timestamptz    NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  CONSTRAINT uq_weight_logs_user_client_id UNIQUE (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_logged 
  ON weight_logs (user_id, logged_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_weight_logs_client_id 
  ON weight_logs (client_id) 
  WHERE client_id IS NOT NULL;

-- ============================================================================
-- 3. Body Circumference & Composition Measurements Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS body_measurements (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  logged_at       timestamptz    NOT NULL,
  waist_cm        numeric(5, 2)  CHECK (waist_cm > 30.0 AND waist_cm < 250.0),
  chest_cm        numeric(5, 2)  CHECK (chest_cm > 30.0 AND chest_cm < 250.0),
  hip_cm          numeric(5, 2)  CHECK (hip_cm > 30.0 AND hip_cm < 250.0),
  arm_cm          numeric(5, 2)  CHECK (arm_cm > 10.0 AND arm_cm < 100.0),
  neck_cm         numeric(5, 2)  CHECK (neck_cm > 15.0 AND neck_cm < 80.0),
  body_fat_pct    numeric(4, 1)  CHECK (body_fat_pct >= 3.0 AND body_fat_pct <= 60.0),
  muscle_mass_kg  numeric(5, 2)  CHECK (muscle_mass_kg >= 10.0 AND muscle_mass_kg <= 200.0),
  notes           text,
  source          varchar(20)    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'synced')),
  client_id       varchar(64),
  created_at      timestamptz    NOT NULL DEFAULT now(),
  updated_at      timestamptz    NOT NULL DEFAULT now(),
  deleted_at      timestamptz,

  CONSTRAINT uq_body_measurements_user_client_id UNIQUE (user_id, client_id),
  CONSTRAINT chk_at_least_one_measurement CHECK (
    waist_cm IS NOT NULL OR
    chest_cm IS NOT NULL OR
    hip_cm IS NOT NULL OR
    arm_cm IS NOT NULL OR
    neck_cm IS NOT NULL OR
    body_fat_pct IS NOT NULL OR
    muscle_mass_kg IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_logged 
  ON body_measurements (user_id, logged_at DESC) 
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. Transaction-Safe Profile Weight Synchronization
-- ============================================================================
-- Handles concurrent writes, backdated entries, edits, and deletions safely.
-- Acquires an exclusive row-level lock (FOR UPDATE) on user_profiles to serialize
-- concurrent modifications for the same user, preventing race conditions.
CREATE OR REPLACE FUNCTION sync_profile_current_weight()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id UUID;
  latest_weight NUMERIC(5, 1);
  earliest_weight NUMERIC(5, 1);
  existing_starting_weight NUMERIC(5, 1);
BEGIN
  -- Determine target user depending on trigger operation
  IF TG_OP = 'DELETE' THEN
    target_user_id := OLD.user_id;
  ELSE
    target_user_id := NEW.user_id;
  END IF;

  -- Acquire row-level lock on the user's profile to serialize concurrent transactions for this user.
  -- Other users are completely unaffected and run in parallel.
  SELECT starting_weight_kg INTO existing_starting_weight
  FROM user_profiles 
  WHERE user_id = target_user_id 
  FOR UPDATE;

  -- If user_profiles row does not exist for this user, do nothing.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- If starting_weight_kg is not yet set, initialize it with the earliest active weight log.
  -- Once set, starting_weight_kg is NEVER overwritten by subsequent entries.
  IF existing_starting_weight IS NULL THEN
    SELECT ROUND(weight_kg, 1) INTO earliest_weight
    FROM weight_logs
    WHERE user_id = target_user_id AND deleted_at IS NULL
    ORDER BY logged_at ASC, created_at ASC
    LIMIT 1;

    IF earliest_weight IS NOT NULL THEN
      UPDATE user_profiles
      SET starting_weight_kg = earliest_weight
      WHERE user_id = target_user_id AND starting_weight_kg IS NULL;
      existing_starting_weight := earliest_weight;
    END IF;
  END IF;

  -- Find the weight of the chronologically latest active entry (breaking ties with created_at DESC)
  SELECT ROUND(weight_kg, 1) INTO latest_weight
  FROM weight_logs
  WHERE user_id = target_user_id AND deleted_at IS NULL
  ORDER BY logged_at DESC, created_at DESC
  LIMIT 1;

  -- Update user_profiles.current_weight_kg:
  -- - If entries exist, set to latest_weight.
  -- - If all entries were deleted, fall back to existing starting_weight_kg.
  UPDATE user_profiles
  SET current_weight_kg = COALESCE(latest_weight, existing_starting_weight),
      updated_at = NOW()
  WHERE user_id = target_user_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_weight ON weight_logs;

CREATE TRIGGER trg_sync_profile_weight
AFTER INSERT OR UPDATE OR DELETE ON weight_logs
FOR EACH ROW EXECUTE FUNCTION sync_profile_current_weight();
