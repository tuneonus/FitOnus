-- Migration 0010: Create Goals and Habit Tracking System
-- Phase 6: Core Goals, Checkpoints, Habits, and Habit Completions

-- 1. Goals Table
-- Represents long-term targets, daily reset targets, and streak milestones
CREATE TABLE goals (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type                varchar(32)    NOT NULL CHECK (type IN (
                        'weightLoss', 'muscleGain', 'maintain',
                        'run5k', 'run10k', 'marathon',
                        'steps', 'water', 'protein', 'streak',
                        'workoutFrequency', 'custom'
                      )),
  title               varchar(150)   NOT NULL,
  description         text,
  metric_unit         varchar(30)    NOT NULL,
  start_value         numeric(10, 2) NOT NULL CHECK (start_value >= 0),
  current_value       numeric(10, 2) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  target_value        numeric(10, 2) NOT NULL CHECK (target_value >= 0),
  cadence             varchar(20)    NOT NULL DEFAULT 'once' CHECK (cadence IN ('once', 'daily', 'weekly', 'streak')),
  direction           varchar(20)    NOT NULL DEFAULT 'decrease' CHECK (direction IN ('decrease', 'increase', 'maintain')),
  status              varchar(20)    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'paused')),
  is_primary          boolean        NOT NULL DEFAULT false,
  deadline_label      varchar(50)    NOT NULL DEFAULT 'Ongoing',
  target_date         date,
  completed_at        timestamptz,
  telemetry_source    varchar(30)    CHECK (telemetry_source IN ('weight_logs', 'water_intake', 'nutrition_meals', 'workout_sessions', 'manual')),
  metadata            jsonb          NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_goals_user_status ON goals (user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_goals_user_primary ON goals (user_id) WHERE is_primary = true AND deleted_at IS NULL;
CREATE INDEX idx_goals_user_type ON goals (user_id, type) WHERE deleted_at IS NULL;

-- 2. Goal Checkpoints Table
-- Immutable progress milestones and historical chart data points
CREATE TABLE goal_checkpoints (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       uuid           NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  user_id       uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  value         numeric(10, 2) NOT NULL CHECK (value >= 0),
  date          date           NOT NULL DEFAULT CURRENT_DATE,
  recorded_at   timestamptz    NOT NULL DEFAULT now(),
  source        varchar(30)    NOT NULL DEFAULT 'manual',
  notes         text
);

CREATE INDEX idx_goal_checkpoints_goal_date ON goal_checkpoints (goal_id, date DESC);
CREATE INDEX idx_goal_checkpoints_user_recorded ON goal_checkpoints (user_id, recorded_at DESC);

-- 3. Habits Definition Table
-- Daily or weekly recurring micro-habits
CREATE TABLE habits (
  id                     uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title                  varchar(150)   NOT NULL,
  description            text,
  category               varchar(30)    NOT NULL DEFAULT 'general' CHECK (category IN ('nutrition', 'fitness', 'wellness', 'mindset', 'recovery', 'general')),
  frequency              varchar(20)    NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  target_days_per_week   smallint       NOT NULL DEFAULT 7 CHECK (target_days_per_week >= 1 AND target_days_per_week <= 7),
  icon                   varchar(50)    NOT NULL DEFAULT 'check',
  color                  varchar(30)    NOT NULL DEFAULT 'teal',
  current_streak         integer        NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak         integer        NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  total_completions      integer        NOT NULL DEFAULT 0 CHECK (total_completions >= 0),
  is_archived            boolean        NOT NULL DEFAULT false,
  created_at             timestamptz    NOT NULL DEFAULT now(),
  updated_at             timestamptz    NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

CREATE INDEX idx_habits_user_active ON habits (user_id) WHERE is_archived = false AND deleted_at IS NULL;

-- 4. Habit Completions Table
-- Idempotent daily completion records (ON CONFLICT DO NOTHING ensures offline synchronization safety)
CREATE TABLE habit_completions (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id      uuid           NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  user_id       uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date          date           NOT NULL,
  completed_at  timestamptz    NOT NULL DEFAULT now(),
  notes         text,
  CONSTRAINT uq_habit_completion_day UNIQUE (habit_id, date)
);

CREATE INDEX idx_habit_completions_user_date ON habit_completions (user_id, date DESC);
CREATE INDEX idx_habit_completions_habit_date ON habit_completions (habit_id, date DESC);
