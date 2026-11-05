-- Fitness Profiles and User Settings
CREATE TABLE user_profiles (
  user_id                        uuid         PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  sex                            text         NOT NULL DEFAULT 'unspecified',
  date_of_birth                  date,
  height_cm                      numeric(5,1),
  current_weight_kg              numeric(5,1),
  target_weight_kg               numeric(5,1),
  primary_goal                   text,
  experience_level               text,
  preferred_workout_place        text,
  workout_days_per_week          smallint,
  preferred_workout_duration_min smallint,
  available_equipment            text[]       NOT NULL DEFAULT '{}',
  diet_type                      text,
  allergies                      text[]       NOT NULL DEFAULT '{}',
  preferred_cuisines             text[]       NOT NULL DEFAULT '{}',
  onboarding_completed           boolean      NOT NULL DEFAULT false,
  current_onboarding_step        text         NOT NULL DEFAULT 'intro',
  daily_calorie_target           integer,
  daily_protein_grams            integer,
  version                        integer      NOT NULL DEFAULT 1,
  created_at                     timestamptz  NOT NULL DEFAULT now(),
  updated_at                     timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT user_profiles_sex_valid CHECK (
    sex IN ('male', 'female', 'unspecified')
  ),
  CONSTRAINT user_profiles_dob_valid CHECK (
    date_of_birth IS NULL OR (date_of_birth >= '1920-01-01' AND date_of_birth <= CURRENT_DATE - INTERVAL '13 years')
  ),
  CONSTRAINT user_profiles_height_valid CHECK (
    height_cm IS NULL OR (height_cm >= 50.0 AND height_cm <= 260.0)
  ),
  CONSTRAINT user_profiles_current_weight_valid CHECK (
    current_weight_kg IS NULL OR (current_weight_kg >= 25.0 AND current_weight_kg <= 450.0)
  ),
  CONSTRAINT user_profiles_target_weight_valid CHECK (
    target_weight_kg IS NULL OR (target_weight_kg >= 25.0 AND target_weight_kg <= 450.0)
  ),
  CONSTRAINT user_profiles_primary_goal_valid CHECK (
    primary_goal IS NULL OR primary_goal IN ('lose', 'gain', 'maintain', 'strength', '5k', '10k', 'marathon')
  ),
  CONSTRAINT user_profiles_experience_valid CHECK (
    experience_level IS NULL OR experience_level IN ('beginner', 'intermediate', 'advanced')
  ),
  CONSTRAINT user_profiles_workout_place_valid CHECK (
    preferred_workout_place IS NULL OR preferred_workout_place IN ('gym', 'home', 'outdoor', 'mixed')
  ),
  CONSTRAINT user_profiles_days_per_week_valid CHECK (
    workout_days_per_week IS NULL OR (workout_days_per_week >= 1 AND workout_days_per_week <= 7)
  ),
  CONSTRAINT user_profiles_duration_min_valid CHECK (
    preferred_workout_duration_min IS NULL OR (preferred_workout_duration_min >= 15 AND preferred_workout_duration_min <= 180)
  ),
  CONSTRAINT user_profiles_diet_type_valid CHECK (
    diet_type IS NULL OR diet_type IN ('none', 'vegetarian', 'eggetarian', 'vegan', 'pescatarian')
  ),
  CONSTRAINT user_profiles_targets_positive CHECK (
    (daily_calorie_target IS NULL OR daily_calorie_target > 500) AND
    (daily_protein_grams IS NULL OR daily_protein_grams > 20)
  ),
  CONSTRAINT user_profiles_version_positive CHECK (version > 0)
);

CREATE INDEX user_profiles_onboarding_idx ON user_profiles (onboarding_completed) WHERE NOT onboarding_completed;

CREATE TABLE user_settings (
  user_id                uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  theme_mode             text        NOT NULL DEFAULT 'system',
  unit_system            text        NOT NULL DEFAULT 'metric',
  health_connect_enabled boolean     NOT NULL DEFAULT false,
  smartwatch_connected   boolean     NOT NULL DEFAULT false,
  notifications_enabled  boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_settings_theme_valid CHECK (theme_mode IN ('system', 'light', 'dark')),
  CONSTRAINT user_settings_unit_valid CHECK (unit_system IN ('metric', 'imperial'))
);

