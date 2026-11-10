# FITONUS — DEV FRESH START EXECUTION READINESS REPORT

**Document ID:** `FITONUS-DEV-FRESH-START-EXEC-001`  
**Date:** November 9, 2026  
**Auditor Roles:** Senior PostgreSQL DBA, Backend Architect, React Native Lead, Security Engineer, QA Release Engineer  
**Workspace:** `/media/devshan/Study_Drive/Info/Projects/TuneOnus/FitOnus`  
**Status:** **AUDIT & DRY-RUN COMPLETE — TRANSACTIONAL REHEARSAL VERIFIED — AWAITING EXPLICIT APPROVAL**

---

## 1. EXECUTIVE SUMMARY

This audit and execution readiness report establishes the technical preparation to reset the **Neon DEV** PostgreSQL database to an authentic, zero-mock, Admin-managed state for the FitOnus platform. 

All preparation steps have been completed **strictly in a read-only / dry-run manner**:
1. **Neon DEV Identity Confirmed:** Live metadata verified project `mute-surf-61144531`, branch `br-fragrant-morning-b35lwkjg`, and pooler endpoint `ep-shy-art-b3sxwfkd`. Forbidden PROD (`br-icy-term-b3lb70tb` / `ep-gentle-bar-b3ywek03`) was strictly isolated and untouched.
2. **Reconciled Table Inventory:** All 39 base tables were audited on the live DEV database. The discrepancy in previous reports has been definitively resolved:
   - **Current Total Database Rows:** **567**
   - **Rows Targeted for Cleanup:** **528**
   - **Preserved Core System Rows:** **39** across 6 foundational tables
   - **Mathematical Invariant:** $567 - 528 = 39$ (Exact 100% reconciliation)
3. **Mobile Zero-Data Fixes Implemented & Verified:**
   - `workoutStore.ts`: Mock exercise catalog and fake push workout removed; `catalog: []`, `plannedSession: null`.
   - `RecommendedWorkout.tsx`: Renders a truthful, premium empty card when no workout is planned or active.
   - `WorkoutPlanScreen.tsx`: Displays a clean empty state with an action button to "Build a workout" via the workout generator.
   - `ExerciseLibraryScreen.tsx`: Distinguishes between zero database exercises vs empty filter results; safely initializes planned sessions.
   - `workoutPlanGenerator.ts`: Removed fallback mock exercise catalog; throws an error when no exercises exist, triggering a native error banner.
   - `workoutsMock.ts`: `exerciseById` fallback changed from `exercises[0]!` (Barbell Bench Press) to an unopinionated safe object.
4. **Transactional Dry Run Rehearsal Verified:** Executed `backend/scripts/dev-fresh-start.sql` inside a transactional block (`BEGIN ... DELETE ... ASSERT ... ROLLBACK;`). All 10 pre- and post-condition assertions passed in 119ms, and the database row count was confirmed unchanged at 567.
5. **Quality Gates Passed:**
   - Mobile: 272/272 tests passing (including 6 new zero-data regression tests), `tsc --noEmit` 0 errors.
   - Backend: 740/740 unit tests passing, `tsc --noEmit` 0 errors.
   - Admin: 70/70 tests passing, `tsc -p admin/tsconfig.json --noEmit` 0 errors.
6. **Safety Stance:** **NO DATA HAS BEEN DELETED OR COMMITTED.** Cleanup execution requires explicit authorization.

---

## 2. VERIFIED DEV DATABASE IDENTITY

Runtime database metadata was queried from the active database session via `node --import tsx`:

| Attribute | Verified DEV Value | Status |
| :--- | :--- | :--- |
| **Neon Project ID** | `mute-surf-61144531` | **MATCHED (Approved)** |
| **Neon Branch ID** | `br-fragrant-morning-b35lwkjg` | **MATCHED (Approved)** |
| **Neon Endpoint ID** | `ep-shy-art-b3sxwfkd` | **MATCHED (Approved)** |
| **Database Engine** | PostgreSQL 18.6 (`x86_64-pc-linux-gnu`) | **HEALTHY** |
| **Target Database Name** | `neondb` | **MATCHED** |
| **Target Role** | `neondb_owner` | **VERIFIED** |
| **SSL Enforcement** | `sslmode=require` / `verify-full` | **ENFORCED** |
| **Forbidden PROD Branch** | `br-icy-term-b3lb70tb` | **BLOCKED & UNTOUCHED** |
| **Forbidden PROD Endpoint**| `ep-gentle-bar-b3ywek03` | **BLOCKED & UNTOUCHED** |

**Verification Guard:** Both `backend/scripts/dev-fresh-start.sql` and the test runner `backend/scripts/run-fresh-start-dry-run.ts` implement hard programmatic guards that immediately abort execution if `DATABASE_URL` references production identifiers or if the target database is not `neondb`.

---

## 3. RECONCILED DATABASE TABLE INVENTORY

The previous audit noted discrepancies between 528 and 567 rows. A live audit of all 39 tables in `neondb` provides the definitive breakdown:

| # | Table Name | Category | Current Rows | Proposed Action | Post-Cleanup Expected |
| :--- | :--- | :--- | :---: | :--- | :---: |
| 1 | `schema_migrations` | System Configuration | 15 | **PRESERVE** | 15 |
| 2 | `gemini_pricing` | System Configuration | 8 | **PRESERVE** | 8 |
| 3 | `app_settings` | System Configuration | 7 | **PRESERVE** | 7 |
| 4 | `badges` | System Reference | 7 | **PRESERVE (System Standard)** | 7 |
| 5 | `gemini_config` | System Configuration | 1 | **PRESERVE** | 1 |
| 6 | `users` | Auth / User Accounts | 50 | **PRESERVE ADMIN (1) / DELETE (49)** | 1 |
| 7 | `auth_sessions` | Auth / Security | 142 | **DELETE ALL TEST SESSIONS** | 0 |
| 8 | `admin_audit_logs` | Audit / Telemetry | 62 | **DELETE DEV TEST LOGS** | 0 |
| 9 | `personal_records` | User Activity | 57 | **DELETE** | 0 |
| 10 | `workout_session_sets` | User Activity | 30 | **DELETE** | 0 |
| 11 | `foods` | Reference Catalog | 25 | **DELETE (Admin will populate)** | 0 |
| 12 | `user_profiles` | User-Generated | 20 | **DELETE (Non-admin)** | 0 |
| 13 | `workout_exercises` | Reference Catalog | 19 | **DELETE** | 0 |
| 14 | `exercises` | Reference Catalog | 15 | **DELETE (Admin will populate)** | 0 |
| 15 | `meal_items` | User Activity | 14 | **DELETE** | 0 |
| 16 | `user_settings` | User-Generated | 14 | **DELETE (Non-admin)** | 0 |
| 17 | `workout_sessions` | User Activity | 12 | **DELETE** | 0 |
| 18 | `coach_messages` | AI Telemetry | 11 | **DELETE** | 0 |
| 19 | `coach_conversations` | AI Telemetry | 10 | **DELETE** | 0 |
| 20 | `workouts` | Reference Catalog | 9 | **DELETE (Admin will populate)** | 0 |
| 21 | `gemini_usage_events` | AI Telemetry | 8 | **DELETE** | 0 |
| 22 | `meals` | User Activity | 6 | **DELETE** | 0 |
| 23 | `water_intake` | User Activity | 6 | **DELETE** | 0 |
| 24 | `idempotency_keys` | System / Transient | 5 | **DELETE** | 0 |
| 25 | `challenges` | Reference Catalog | 4 | **DELETE (Admin will populate)** | 0 |
| 26 | `gamification_profiles` | User Activity | 4 | **DELETE** | 0 |
| 27 | `challenge_occurrences`| Reference Catalog | 3 | **DELETE** | 0 |
| 28 | `challenge_enrollments`| User Activity | 1 | **DELETE** | 0 |
| 29 | `goal_checkpoints` | User Activity | 1 | **DELETE** | 0 |
| 30 | `goals` | User Activity | 1 | **DELETE** | 0 |
| 31 | `body_measurements` | User Activity | 0 | **NO-OP (0)** | 0 |
| 32 | `coach_memories` | AI Telemetry | 0 | **NO-OP (0)** | 0 |
| 33 | `food_favorites` | User Activity | 0 | **NO-OP (0)** | 0 |
| 34 | `gamification_points_ledger` | User Activity | 0 | **NO-OP (0)** | 0 |
| 35 | `habit_completions` | User Activity | 0 | **NO-OP (0)** | 0 |
| 36 | `habits` | User Activity | 0 | **NO-OP (0)** | 0 |
| 37 | `user_ai_usage` | AI Telemetry | 0 | **NO-OP (0)** | 0 |
| 38 | `user_badges` | User Activity | 0 | **NO-OP (0)** | 0 |
| 39 | `weight_logs` | User Activity | 0 | **NO-OP (0)** | 0 |
| **TOTAL** | **39 Tables Audited** | — | **567** | **528 Rows Deleted** | **39 Rows Preserved** |

### Verified Preserved System Rows: Exactly 39
1. **15** `schema_migrations`: Baseline schema versions 001 through 015.
2. **8** `gemini_pricing`: Token cost matrix for Gemini models (`gemini-2.5-flash`, `gemini-2.5-pro`, etc.).
3. **7** `app_settings`: System configuration keys (maintenance mode, minimum app version, rate limits, feature flags).
4. **7** `badges`: Core system badge definitions seeded in migration 012 (`first_workout`, `workout_streak_3`, `workout_streak_7`, `first_meal`, `first_goal`, `challenge_complete`, `weight_goal_reached`).
5. **1** `gemini_config`: Active Gemini AI provider configuration record.
6. **1** `users`: Approved platform administrator account:
   - **Email:** `admin@fitonus.com`
   - **User ID:** `ae1c758b-e47d-4053-ab70-4114c2bfab79`
   - **Role:** `admin`

---

## 4. MOBILE ZERO-DATA CODE FIXES

The mobile client was inspected and modified to eliminate all mock and fallback data traps:

### A. Workout Store (`mobile/src/features/workouts/store/workoutStore.ts`)
- **Before:** Initialized with `plannedSession: todaySession` (hardcoded "Chest + Triceps" push workout) and `catalog: fallbackExercises` (14 hardcoded exercises).
- **After:** Initialized with `catalog: []` and `plannedSession: null`.
- **API Synchronization:** When `loadExercises()` receives an empty array `[]` from the backend API, it updates the catalog to `[]` instead of retaining stale mock data.
- **Lookup Fallback:** `getExerciseById(id)` returns a neutral fallback `{ id, name: 'Exercise', muscle: 'Full body', ... }` instead of defaulting to `Barbell Bench Press`.
- **Null Safety:** `startSession()`, `finishSession()`, and `removePlannedExercise()` handle `plannedSession === null` safely without throwing runtime `TypeError` exceptions.

### B. Recommended Workout Component (`mobile/src/features/home/components/RecommendedWorkout.tsx`)
- **Before:** Displayed a hardcoded "Chest + Triceps" card when no session was active.
- **After:** Evaluates `!completed && !inProgress && !hasExercises`. Renders a premium empty card:
  - Header: `"NO WORKOUT PLANNED"`
  - Title: `"Ready to train?"`
  - Body: `"Build a session tailored to your goals and available equipment, or choose movements from the library."`
  - Action Button: `"Build a workout"` (navigates to `workoutGenerator`).

### C. Workout Plan Screen (`mobile/src/features/workouts/screens/WorkoutPlanScreen.tsx`)
- **Before:** Attempted to render `plannedSession.exercises` unconditionally.
- **After:** When `!plannedSession || plannedSession.exercises.length === 0`, renders `EmptyState`:
  - Title: `"No workout planned"`
  - Body: `"Generate a personalized workout plan or add exercises from the library to get started."`
  - Action Button: `"Build a workout"`.

### D. Exercise Library Screen (`mobile/src/features/workouts/screens/ExerciseLibraryScreen.tsx`)
- **Before:** Showed "No matching exercises. Clear filters" even when the entire catalog was empty in the database.
- **After:** Distinguishes between zero database data vs empty search results:
  - When `catalog.length === 0`: Shows `EmptyState` `"No exercises in library"` with message `"No exercises are currently available. Check back soon or contact your coach/admin."`
  - When filters yield 0 results: Shows `"No matching exercises"` with `"Clear filters"`.
  - In `add(id)`: Safely initializes a new `WorkoutSession` if `plannedSession` is null.

### E. AI Workout Plan Generator (`mobile/src/features/workouts/services/workoutPlanGenerator.ts`)
- **Before:** Imported `fallbackExercises` from mock and used them if backend returned fewer than 4 exercises.
- **After:** Removed all mock imports and fallback logic. When `WorkoutService.getExercises()` returns an empty catalog `[]`, it throws:
  `Error: 'No exercises available in catalog to generate a plan'`.
  The UI in `WorkoutGeneratorScreen.tsx` catches this and displays an honest `StatusBanner` error with a Retry button rather than fabricating a fake workout.

---

## 5. ADMIN CRUD CAPABILITIES

The Next.js Admin Panel (`admin/`) provides end-to-end management capabilities for the platform content:

| Feature Domain | Admin UI Path | API Route | Backend Handler | PostgreSQL Table | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Exercises** | `/admin/workouts` | `POST /api/v1/exercises` | `WorkoutController.createExercise` | `exercises` | **OPERATIONAL** |
| **Foods** | `/admin/nutrition` | `POST /api/v1/nutrition/foods` | `NutritionController.createFood` | `foods` | **OPERATIONAL** |
| **Workout Plans** | `/admin/workouts` | `POST /api/v1/workout-plans` | `WorkoutController.createPlan` | `workouts` | **OPERATIONAL** |
| **Challenges** | `/admin/challenges` | `POST /api/v1/challenges` | `ChallengesController.create` | `challenges` | **OPERATIONAL** |
| **Badges** | `/admin/challenges` | `GET /api/v1/badges` | `ChallengesController.listBadges` | `badges` | **OPERATIONAL** |
| **App Settings** | `/admin/settings` | `PUT /api/v1/settings` | `SettingsController.updateSettings` | `app_settings` | **OPERATIONAL** |
| **Gemini AI** | `/admin/settings` | `PUT /api/v1/settings/gemini` | `SettingsController.updateGemini` | `gemini_config` | **OPERATIONAL** |

All write actions performed in Admin propagate directly to PostgreSQL and are instantly accessible to mobile users via the REST API.

---

## 6. PROPOSED DATA CLEANUP STRATEGY

### Foreign Key Deletion Sequence (Topological Order)
PostgreSQL constraints require deleting leaf tables first to satisfy foreign key dependencies, specifically addressing `ON DELETE RESTRICT` constraints on `exercises(id)`:

```
[Level 1: Leaf Workouts]
workout_exercises (ON DELETE RESTRICT on exercises)
workout_session_sets (ON DELETE RESTRICT on exercises)
personal_records (ON DELETE CASCADE)
       │
       ▼
[Level 2: Workout Sessions & Plans]
workout_sessions
workouts
       │
       ▼
[Level 3: Exercises Catalog]
exercises (Cleanly deleted; no references remaining)
       │
       ▼
[Level 4: Nutrition & Foods]
meal_items (ON DELETE SET NULL on foods)
meals
food_favorites
foods (Cleanly deleted)
       │
       ▼
[Level 5: Challenges & Gamification]
challenge_enrollments -> challenge_occurrences -> challenges
user_badges -> gamification_points_ledger -> gamification_profiles
       │
       ▼
[Level 6: Goals, Habits, Coach & Telemetry]
habit_completions -> habits
goal_checkpoints -> goals
coach_messages -> coach_conversations -> coach_memories
gemini_usage_events -> user_ai_usage
water_intake, weight_logs, body_measurements, idempotency_keys
       │
       ▼
[Level 7: User Administration & Auth]
admin_audit_logs (Test logs purged)
auth_sessions (All test sessions purged)
user_profiles (WHERE user_id != admin_id)
user_settings (WHERE user_id != admin_id)
       │
       ▼
[Level 8: User Accounts]
users (WHERE id != 'ae1c758b-e47d-4053-ab70-4114c2bfab79')
```

---

## 7. TRANSACTIONAL REHEARSAL RESULTS

The dry-run rehearsal script (`backend/scripts/run-fresh-start-dry-run.ts`) executing `backend/scripts/dev-fresh-start.sql` was conducted against the live Neon DEV database:

```
--- 1. PRE-REHEARSAL DATABASE STATE ---
Tables audited: 39
Total rows before rehearsal: 567

--- 2. EXECUTING dev-fresh-start.sql (WITH ROLLBACK) ---
[PG NOTICE] Safety guards verified: Database=neondb Admin=admin@fitonus.com (ae1c758b-e47d-4053-ab70-4114c2bfab79)
[PG NOTICE] TRANSACTIONAL ASSERTIONS PASSED: Exactly 39 preserved system rows remain across all tables. Exactly 528 test rows deleted.
✓ Rehearsal transaction executed successfully in 119ms (ended in ROLLBACK)

--- 3. POST-REHEARSAL DATABASE STATE (AFTER ROLLBACK) ---
Total rows after rollback: 567
✓ PERFECT ROLLBACK VERIFIED: Exact row count unchanged (567 rows)
✓ ALL PRE-CONDITIONS, DELETIONS, AND ZERO-DATA ASSERTIONS PASSED INSIDE TRANSACTION
```

---

## 8. MOBILE REGRESSION TEST RESULTS

A dedicated test suite (`mobile/tests/workout-zero-data.test.ts`) was executed alongside the full mobile test runner:

```
▶ Workout zero-data and admin-managed catalog behavior
  ✔ 1. Initializes with empty catalog and null planned session (no fake chest workout) (3.078ms)
  ✔ 2. Missing exercise ID returns safe fallback without fabricating Barbell Bench Press (0.641ms)
  ✔ 3. An empty backend API response clears cached catalog to truthful zero (0.614ms)
  ✔ 4. Admin-created exercises from API are loaded and retrievable by ID (0.537ms)
  ✔ 5. AI Workout Plan Generator throws error instead of generating fake workout when catalog is empty (1.484ms)
  ✔ 6. AI Workout Plan Generator succeeds when real admin exercises exist (0.834ms)
✔ Workout zero-data and admin-managed catalog behavior (10.257ms)

Total Mobile Test Suite:
ℹ tests 272
ℹ suites 104
ℹ pass 272
ℹ fail 0
```

---

## 9. COMPLETE ROLLBACK VERIFICATION

| Verification Metric | Expected Value | Actual Rehearsal Value | Status |
| :--- | :---: | :---: | :---: |
| Pre-rehearsal live row count | 567 | 567 | **VERIFIED** |
| Transactional deleted rows | 528 | 528 | **VERIFIED** |
| In-transaction preserved rows | 39 | 39 | **VERIFIED** |
| Post-rollback live row count | 567 | 567 | **VERIFIED (0 Drift)** |
| Schema modifications | 0 | 0 | **VERIFIED** |
| Uncommitted Git changes reverted | 0 | 0 | **CONCURRENT DEV PRESERVED** |

---

## 10. EXECUTION RISK ASSESSMENT & MITIGATION

| Risk | Impact | Probability | Mitigation Implemented |
| :--- | :--- | :---: | :--- |
| **Targeting Production Database** | Critical | Negligible | Hard-coded runtime guards in SQL and Node runner abort if host contains `ep-gentle-bar-b3ywek03` or branch `br-icy-term-b3lb70tb`. |
| **Accidental Admin Deletion** | Critical | Negligible | SQL guard queries `users` table for `admin@fitonus.com` (`ae1c758b-e47d-4053-ab70-4114c2bfab79`) before and after deletions; aborts if missing. |
| **Foreign Key RESTRICT Lockout**| Medium | Negligible | Leaf tables (`workout_exercises`, `workout_session_sets`) are explicitly deleted prior to `exercises`. |
| **Mobile Runtime Crash on Null Plan**| Medium | Negligible | All mobile store actions, screens, and generators have been updated and tested for `plannedSession === null`. |
| **Mobile Fallback to Mock Data**| Low | Negligible | Store defaults to `catalog: []`, `plannedSession: null`; generator fails with an honest error. |

---

## 11. EXPLICIT APPROVAL REQUIREMENT

In strict compliance with deployment safety rules:
- **No data has been deleted or committed in PostgreSQL.**
- **The SQL script currently ends in `ROLLBACK;`.**
- **To execute the permanent cleanup, the user must provide explicit authorization.**

---

### REQUIRED USER COMMAND TO PROCEED:

```text
Approve DEV cleanup COMMIT on branch br-fragrant-morning-b35lwkjg.
```

