# FitOnus — Phase 2B: Fitness Profile & Onboarding Backend Implementation Report

**Status:** Completed & Verified  
**Date:** 2026-11-04  
**Author:** Antigravity (Senior Node.js, Express, PostgreSQL & Clean Architecture Engineer)  
**Database:** PostgreSQL on Neon (`ep-gentle-bar-b3ywek03-pooler`)  
**Base Architecture:** Node.js 22 + Express 5 + TypeScript + Raw SQL (`pg`) + Zod + Vitest  

---

## 1. Executive Summary

Phase 2B delivers the end-to-end backend implementation for the **Fitness Profile & Onboarding** domain of FitOnus. Built in strict accordance with the approved Phase 2A contract (`backend/BACKEND_AUDIT/PHASE_2_ONBOARDING_CONTRACT.md`), this implementation:
- Adds database migration `0004_create_user_profiles.sql` defining relational tables `user_profiles` and `user_settings` with strict physical constraints, indexes, and automatic timestamp triggers.
- Implements a self-contained Clean Architecture module (`src/modules/profile/`) containing pure domain models, metabolic target computation (Mifflin-St Jeor formula), application ports and use cases, raw parameterized SQL repositories with optimistic concurrency control, and declarative Express 5 routes.
- Wires the module into the root application container under `/api/v1/profile`.
- Passes the complete CI pipeline: 81 automated unit tests across 12 test suites, full TypeScript validation, strict ESLint enforcement (`eslint.config.js` Clean Architecture boundaries), Prettier formatting, and compilation build.
- Fully verified with a live, end-to-end integration test against the remote Neon PostgreSQL database, exercising user registration, default profile provisioning, incremental multi-step onboarding, idempotent completion with calorie/protein target calculation, optimistic locking conflict detection, and settings synchronization.

---

## 2. Inventory of Files Created & Modified

### 2.1 Database Migrations
- `migrations/0004_create_user_profiles.sql` — PostgreSQL DDL creating `user_profiles`, `user_settings`, indices, and timestamp triggers.

### 2.2 Profile Module (`src/modules/profile/`)
- `domain/fitness-profile.ts` — Domain entity `UserProfile`, enums (`Sex`, `FitnessGoal`, `ExperienceLevel`, `WorkoutPlace`, `DietType`, `OnboardingStep`), readiness checks, and factory methods.
- `domain/user-settings.ts` — Domain entity `UserSettings`, theme/unit preferences, and device integration toggles.
- `domain/metabolic-calculator.ts` — Pure domain service implementing the Mifflin-St Jeor equation, activity multiplier lookup, goal adjustments, and macronutrient distribution.
- `application/ports.ts` — Repository interfaces (`ProfileRepository`, `SettingsRepository`), parameters, and database transaction contracts.
- `application/profile-view.ts` — Projection models and mappers (`UserProfileView`, `UserSettingsView`, `OnboardingCompleteView`) aligning with the Phase 2A API contract.
- `application/use-cases/get-profile.ts` — Use case to retrieve or auto-provision default profile on first access.
- `application/use-cases/update-profile.ts` — Atomic profile updater with optimistic locking (`version`).
- `application/use-cases/save-onboarding-step.ts` — Incremental auto-save handler for onboarding steps.
- `application/use-cases/complete-onboarding.ts` — Onboarding completion use case computing metabolic targets with idempotent replay safety.
- `application/use-cases/get-settings.ts` — Retrieves client settings with auto-provisioning.
- `application/use-cases/update-settings.ts` — Mutates client preferences (theme, units, permissions).
- `infrastructure/pg-profile-repository.ts` — Raw SQL repository joining `user_profiles` with `users` (`display_name`) within transactions.
- `infrastructure/pg-settings-repository.ts` — Raw SQL repository for `user_settings`.
- `interface/profile.schemas.ts` — Zod request and response validation schemas.
- `interface/profile.controller.ts` — HTTP controllers mapping Express requests to use cases.
- `interface/profile.routes.ts` — Declarative `defineRoute` configurations with authentication, permissions, and OpenAPI documentation tags.
- `index.ts` — Module factory exposing `createProfileModule` and public contracts.

### 2.3 Application Plumbing & Container
- `src/container.ts` — Registered `createProfileModule` into the application container under `/api/v1/profile`.

### 2.4 Automated Tests
- `tests/unit/profile/metabolic-calculator.test.ts` — 8 unit tests validating BMR, TDEE, calorie deficits/surpluses, protein targets, and age calculations.
- `tests/unit/profile/profile-use-cases.test.ts` — 10 unit tests validating profile lifecycle, step persistence, idempotent completion, settings mutation, and optimistic locking conflict detection.

---

## 3. Database Schema & Migration Details

Migration `0004_create_user_profiles.sql` was executed and verified against Neon PostgreSQL.

### 3.1 `user_profiles` Table
Stores physical, fitness, and nutritional profile data linked 1:1 to `users`.

```sql
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
  CONSTRAINT user_profiles_duration_valid CHECK (
    preferred_workout_duration_min IS NULL OR (preferred_workout_duration_min >= 10 AND preferred_workout_duration_min <= 240)
  ),
  CONSTRAINT user_profiles_diet_type_valid CHECK (
    diet_type IS NULL OR diet_type IN ('none', 'vegetarian', 'eggetarian', 'vegan', 'pescatarian')
  ),
  CONSTRAINT user_profiles_step_valid CHECK (
    current_onboarding_step IN (
      'intro', 'personal', 'dob', 'height', 'weight', 'experience',
      'goal', 'workoutPreference', 'equipment', 'duration', 'food',
      'health', 'device', 'confirm', 'done'
    )
  ),
  CONSTRAINT user_profiles_version_positive CHECK (version >= 1)
);
```

### 3.2 `user_settings` Table
Stores client device, theme, unit preference, and permission sync state.

```sql
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
```

### 3.3 Indexes & Triggers
- `idx_user_profiles_onboarding`: Partial B-Tree index on `user_profiles (onboarding_completed) WHERE onboarding_completed = false` optimizing administrative onboarding funnel queries.
- `idx_user_profiles_goal`: Index on `user_profiles (primary_goal)` for workout recommendation lookups.
- `trg_user_profiles_updated_at` & `trg_user_settings_updated_at`: `BEFORE UPDATE` trigger function automatically keeping `updated_at` timestamps accurate.

---

## 4. API Endpoints Specification & Verification

All endpoints are mounted under `/api/v1/profile` and enforce JWT Bearer authentication (`access: { kind: 'authenticated' }`).

| Method | Path | Summary | Input Payload | Response Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/profile/me` | Fetch authenticated user's profile | None | `200 OK` |
| `PATCH` | `/api/v1/profile/me` | Atomically update profile fields | `{ version, name?, heightCm?, ... }` | `200 OK` or `409 Conflict` |
| `POST` | `/api/v1/profile/onboarding/step` | Save progress of individual step | `{ step, data: { ... } }` | `200 OK` |
| `POST` | `/api/v1/profile/onboarding/complete` | Complete onboarding & compute targets | `{}` (Optional `Idempotency-Key`) | `200 OK` |
| `GET` | `/api/v1/profile/settings` | Get user client settings | None | `200 OK` |
| `PATCH` | `/api/v1/profile/settings` | Update user client settings | `{ themeMode?, unitSystem?, ... }` | `200 OK` |

### 4.1 Endpoint Behavior & Examples

#### `GET /api/v1/profile/me`
Retrieves or auto-provisions the user's profile with default values on initial registration.
```json
{
  "success": true,
  "data": {
    "userId": "2cd92343-f862-423a-acea-1967cd2630f7",
    "name": "Alex Tester",
    "sex": "unspecified",
    "dateOfBirth": null,
    "age": null,
    "heightCm": null,
    "currentWeightKg": null,
    "targetWeightKg": null,
    "primaryGoal": null,
    "experienceLevel": null,
    "preferredWorkoutPlace": null,
    "workoutDaysPerWeek": null,
    "preferredWorkoutDurationMin": null,
    "availableEquipment": [],
    "dietType": null,
    "allergies": [],
    "preferredCuisines": [],
    "onboardingCompleted": false,
    "currentOnboardingStep": "intro",
    "calculatedTargets": null,
    "version": 1,
    "updatedAt": "2026-11-04T14:51:41.218Z"
  },
  "message": "Fitness profile retrieved"
}
```

#### `POST /api/v1/profile/onboarding/step`
Incrementally auto-saves step state as the user progresses through the onboarding screens. Updates the user's canonical `display_name` in `users` when `step === 'personal'` and `data.name` is present.
```json
// Request Body:
{
  "step": "personal",
  "data": { "sex": "male", "name": "Alex T. Smith" }
}

// Response:
{
  "success": true,
  "data": {
    "userId": "2cd92343-f862-423a-acea-1967cd2630f7",
    "name": "Alex T. Smith",
    "sex": "male",
    "currentOnboardingStep": "personal",
    "version": 2,
    "..."
  },
  "message": "Onboarding step progress saved"
}
```

#### `POST /api/v1/profile/onboarding/complete`
Calculates BMR and TDEE using Mifflin-St Jeor, derives daily calorie and protein targets, stores them in `user_profiles`, marks `onboarding_completed = true` and `current_onboarding_step = 'done'`, and returns the calculated plan.
```json
{
  "success": true,
  "data": {
    "onboardingCompleted": true,
    "calculatedPlan": {
      "dailyCalorieTarget": 2298,
      "dailyProteinGrams": 160,
      "workoutsPerWeek": 4,
      "projectedMilestone": "Projected to reach 75 kg with steady adherence (~0.4 kg/week)."
    }
  },
  "message": "Onboarding completed successfully"
}
```

#### `PATCH /api/v1/profile/me` (Optimistic Concurrency Control)
Protects against concurrent overwrite conflicts. If `version` does not match the current database row version:
```json
// Status: 409 Conflict
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Profile was modified concurrently. Please reload the latest data and retry.",
    "requestId": "fb9a2f15-1fda-45c6-b3d1-db0bdd31fa6f"
  }
}
```
When submitted with the current version, the update succeeds and increments `version` by 1.

---

## 5. Metabolic Calculation Engine

Implemented in `src/modules/profile/domain/metabolic-calculator.ts` as a pure, framework-free domain service.

### 5.1 Mifflin-St Jeor Equation
$$\text{BMR}_{\text{male}} = 10 \times \text{weight (kg)} + 6.25 \times \text{height (cm)} - 5 \times \text{age (yr)} + 5$$
$$\text{BMR}_{\text{female}} = 10 \times \text{weight (kg)} + 6.25 \times \text{height (cm)} - 5 \times \text{age (yr)} - 161$$
$$\text{BMR}_{\text{unspecified}} = 10 \times \text{weight (kg)} + 6.25 \times \text{height (cm)} - 5 \times \text{age (yr)} - 78$$

### 5.2 Total Daily Energy Expenditure (TDEE)
$$\text{TDEE} = \text{BMR} \times \text{Activity Multiplier}$$
- $0\text{ days/week (sedentary)} \rightarrow 1.200$
- $1\text{–}2\text{ days/week (light)} \rightarrow 1.375$
- $3\text{–}4\text{ days/week (moderate)} \rightarrow 1.550$
- $5\text{–}6\text{ days/week (very active)} \rightarrow 1.725$
- $7\text{ days/week (extra active)} \rightarrow 1.900$

### 5.3 Goal Adjustment & Safety Floors
- **Weight Loss (`lose`):** $-500\text{ kcal/day}$ deficit. Safety floor: $1,500\text{ kcal}$ for males, $1,200\text{ kcal}$ for females.
- **Muscle Gain (`gain`):** $+300\text{ kcal/day}$ surplus.
- **Maintenance / Athletic (`maintain`, `strength`, `5k`, `10k`, `marathon`):** Calorie intake calibrated to TDEE.

### 5.4 Macronutrient Distribution
- **Protein:**
  - Weight loss / Strength: $2.0\text{ g/kg}$
  - Muscle gain: $2.2\text{ g/kg}$
  - Maintenance / Endurance: $1.6\text{ g/kg}$
- **Fat:** $25\%\text{ of daily calories} \div 9\text{ kcal/g}$.
- **Carbohydrates:** Remaining caloric balance $\div 4\text{ kcal/g}$.

---

## 6. Verification Results

### 6.1 Automated Unit Test Suite
Ran `npm test` (`vitest run --config vitest.config.ts`):
- **12 test files passed (12 total)**
- **81 tests passed (81 total)**
- **Duration:** 1.23s

New Unit Tests:
- `tests/unit/profile/metabolic-calculator.test.ts` (8 tests):
  - Mifflin-St Jeor calculation for male and female.
  - Intermediate multiplier application.
  - Deficit application with safety floor protection.
  - Calorie surplus for muscle gain.
  - Goal-specific protein ratios.
  - Macronutrient balance accounting for total calories.
  - Accurate age computation from ISO birth date.
- `tests/unit/profile/profile-use-cases.test.ts` (10 tests):
  - Profile retrieval and default provisioning.
  - Atomic profile updates with version increment.
  - Optimistic concurrency conflict rejection (`VERSION_CONFLICT`).
  - Name synchronization in `users` repository.
  - Incremental onboarding step persistence.
  - Validation barrier when completing onboarding without required metrics.
  - Metabolic target calculation and profile state transition.
  - Idempotent onboarding completion replay.
  - User settings retrieval and modification.

### 6.2 Code Quality & Clean Architecture Checks
- **TypeScript:** `tsc --noEmit` — 0 errors.
- **ESLint:** `eslint .` — 0 errors, 0 warnings (Clean Architecture boundaries intact).
- **Prettier:** `prettier --check .` — All matched files use Prettier style.
- **Production Build:** `tsc -p tsconfig.build.json` — Built cleanly into `dist/`.

### 6.3 Live End-to-End Database Verification
Executed against Neon PostgreSQL (`ep-gentle-bar-b3ywek03-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb`):
1. **User Registration:** Created ephemeral test user `test_profile_1793803895443@fitonus.test`. Received JWT Bearer access token.
2. **Initial Profile Fetch:** `GET /api/v1/profile/me` returned default uncompleted profile with version 1.
3. **Multi-Step Onboarding:** Saved steps `personal`, `dob`, `height`, `weight`, `goal`, `workoutPreference`, `food`. Verified version incremented and display name synchronized.
4. **Onboarding Completion:** `POST /api/v1/profile/onboarding/complete` computed BMR (1805 kcal), TDEE (2798 kcal), daily calorie target (2298 kcal), daily protein (160g), and projected milestone.
5. **Completion Idempotency:** Subsequent complete request returned identical plan without redundant state mutation.
6. **Settings Management:** Verified `GET /api/v1/profile/settings` and `PATCH /api/v1/profile/settings` successfully mutated `themeMode: 'dark'`, `unitSystem: 'imperial'`, `healthConnectEnabled: true`.
7. **Optimistic Locking:** Stale version update rejected with HTTP `409 Conflict` (`VERSION_CONFLICT`). Valid update succeeded with version increment from 9 to 10.
8. **Teardown:** Cleanly purged test user; cascaded foreign keys deleted rows in `user_profiles` and `user_settings`.

---

## 7. Mobile UI Compatibility

As mandated in the project constraints, **no mobile code was modified**. The mobile application (`mobile/src/screens/onboarding/` and `mobile/src/screens/profile/`) can now directly integrate with the implemented endpoints:
- Onboarding step screens (`StepPersonal`, `StepDob`, `StepHeight`, `StepWeight`, `StepGoal`, `StepWorkoutPreference`, `StepFood`, `StepDevice`) match the step names and data payloads handled by `POST /api/v1/profile/onboarding/step`.
- Final screen (`StepGoalConfirmation`) can trigger `POST /api/v1/profile/onboarding/complete` and display the returned `calculatedPlan`.
- Profile and settings screens (`PersonalInfoScreen`, `FitnessPreferencesScreen`, `NutritionPreferencesScreen`, `SettingsScreen`) can use `GET /api/v1/profile/me`, `PATCH /api/v1/profile/me`, and `/api/v1/profile/settings`.

