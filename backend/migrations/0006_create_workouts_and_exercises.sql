-- Migration 0006: Create Workouts, Exercises, Sessions, and Personal Records

-- 0. Required Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Exercises Catalog (System curated + Custom user exercises)
CREATE TABLE exercises (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(120) NOT NULL,
  description       text,
  instructions      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tips              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  common_mistakes   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  primary_muscles   text[]      NOT NULL,
  secondary_muscles text[]      NOT NULL DEFAULT '{}'::text[],
  equipment         varchar(50) NOT NULL,
  category          varchar(50) NOT NULL,
  difficulty        varchar(20) NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  is_compound       boolean     NOT NULL DEFAULT false,
  image_url         text,
  video_url         text,
  created_by        uuid        REFERENCES users (id) ON DELETE SET NULL,
  is_system         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX idx_exercises_category ON exercises (category) WHERE deleted_at IS NULL;
CREATE INDEX idx_exercises_equipment ON exercises (equipment) WHERE deleted_at IS NULL;
CREATE INDEX idx_exercises_primary_muscles ON exercises USING gin (primary_muscles) WHERE deleted_at IS NULL;
CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_exercises_name_lower ON exercises (lower(name)) WHERE deleted_at IS NULL;

-- 2. Workout Plans (Templates and User Routines)
-- user_id is nullable for system curated templates (is_template = true, user_id IS NULL)
CREATE TABLE workouts (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        REFERENCES users (id) ON DELETE CASCADE,
  name                       varchar(120) NOT NULL,
  description                text,
  workout_type               varchar(50) NOT NULL DEFAULT 'strength',
  estimated_duration_minutes integer     NOT NULL DEFAULT 45 CHECK (estimated_duration_minutes > 0),
  difficulty                 varchar(20) NOT NULL DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  is_template                boolean     NOT NULL DEFAULT false,
  is_ai_generated            boolean     NOT NULL DEFAULT false,
  tags                       text[]      NOT NULL DEFAULT '{}'::text[],
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  deleted_at                 timestamptz,

  CONSTRAINT chk_workout_ownership CHECK (is_template = true OR user_id IS NOT NULL)
);

CREATE INDEX idx_workouts_user_id ON workouts (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workouts_templates ON workouts (is_template) WHERE is_template = true AND deleted_at IS NULL;

-- 3. Workout Plan Exercises (Ordered mapping)
CREATE TABLE workout_exercises (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id              uuid        NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  exercise_id             uuid        NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  order_index             integer     NOT NULL DEFAULT 0,
  target_sets             integer     NOT NULL DEFAULT 3 CHECK (target_sets > 0),
  target_reps             varchar(20) NOT NULL DEFAULT '8-12',
  target_duration_seconds integer,
  target_weight_kg        numeric(6, 2) DEFAULT 0 CHECK (target_weight_kg >= 0),
  rest_seconds            integer     NOT NULL DEFAULT 90 CHECK (rest_seconds >= 0),
  notes                   text,
  superset_group          integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workout_exercises_workout ON workout_exercises (workout_id, order_index ASC);

-- 4. Workout Sessions (Historical & Completed Gym Logs)
CREATE TABLE workout_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workout_id        uuid        REFERENCES workouts (id) ON DELETE SET NULL,
  workout_name      varchar(120) NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz NOT NULL DEFAULT now(),
  duration_seconds  integer     NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  total_volume_kg   numeric(10, 2) NOT NULL DEFAULT 0 CHECK (total_volume_kg >= 0),
  total_sets        integer     NOT NULL DEFAULT 0 CHECK (total_sets >= 0),
  total_reps        integer     NOT NULL DEFAULT 0 CHECK (total_reps >= 0),
  calories_burned   integer     CHECK (calories_burned >= 0),
  calories_source   varchar(20) NOT NULL DEFAULT 'estimated' CHECK (calories_source IN ('estimated', 'wearable', 'manual')),
  difficulty_rating integer     CHECK (difficulty_rating BETWEEN 1 AND 5),
  notes             text,
  is_completed      boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workout_sessions_user_date ON workout_sessions (user_id, started_at DESC);
CREATE INDEX idx_workout_sessions_workout_id ON workout_sessions (workout_id);

-- 5. Workout Session Sets (Set-by-set telemetry)
CREATE TABLE workout_session_sets (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid        NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
  exercise_id      uuid        NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  set_number       integer     NOT NULL CHECK (set_number > 0),
  weight_kg        numeric(6, 2) NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  reps             integer     NOT NULL DEFAULT 0 CHECK (reps >= 0),
  duration_seconds integer,
  is_warmup        boolean     NOT NULL DEFAULT false,
  is_dropset       boolean     NOT NULL DEFAULT false,
  is_failure       boolean     NOT NULL DEFAULT false,
  is_pr            boolean     NOT NULL DEFAULT false,
  rpe              integer     CHECK (rpe BETWEEN 1 AND 10),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_sets_session ON workout_session_sets (session_id, set_number ASC);
CREATE INDEX idx_session_sets_exercise ON workout_session_sets (exercise_id);

-- 6. Personal Records (Historical milestone log for progression curves)
CREATE TABLE personal_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  exercise_id      uuid        NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  record_type      varchar(30) NOT NULL CHECK (record_type IN ('max_weight', 'max_reps', 'max_volume', 'estimated_1rm')),
  weight_kg        numeric(6, 2) NOT NULL DEFAULT 0,
  reps             integer     NOT NULL DEFAULT 0,
  volume_kg        numeric(10, 2) NOT NULL DEFAULT 0,
  estimated_1rm_kg numeric(6, 2) NOT NULL DEFAULT 0,
  session_id       uuid        REFERENCES workout_sessions (id) ON DELETE SET NULL,
  achieved_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_personal_records_user_exercise_achieved ON personal_records (user_id, exercise_id, record_type, achieved_at DESC);
CREATE INDEX idx_personal_records_user_exercise ON personal_records (user_id, exercise_id);
