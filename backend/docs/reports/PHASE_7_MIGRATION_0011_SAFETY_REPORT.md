# FitOnus — Phase 7 Migration 0011 Pre-Migration Safety Audit

**Project:** FitOnus  
**Target Environment:** Neon PostgreSQL DEVELOPMENT  
**Date:** 2026-11-06  
**Auditor:** Senior PostgreSQL Database Engineer  
**Mode:** READ-ONLY SAFETY AUDIT (Zero DDL/DML executed)  

---

## 1. Executive Summary & Verdict

| Verification Item | Status | Details |
| :--- | :--- | :--- |
| **Connected Database Branch** | **VERIFIED DEVELOPMENT** | `br-fragrant-morning-b35lwkjg` |
| **Protected Production Branch** | **SAFE / UNTOUCHED** | `br-icy-term-b3lb70tb` |
| **Current Migration State** | **0001–0010 Applied** | Migration 0011 is **PENDING** |
| **Phase 7 Tables in DB** | **NONE** (`[]`) | Clean target state, no partial table artifacts |
| **Existing Data Preservation** | **100% PRESERVED** | Purely additive DDL; 0 drops, 0 alters, 0 truncates |
| **Migration Runner Safety** | **ACID & Idempotent** | Single transaction (`BEGIN ... COMMIT`) + Advisory Lock |
| **Audit Recommendation** | **GO (Safe to apply to DEVELOPMENT only)** | Awaiting explicit user execution approval |

---

## 2. Actual Database Target Verification

The database connection was inspected using PostgreSQL runtime session settings (`pg_settings`) without exposing credentials:

- **Neon Branch GUC Query:** `SELECT setting FROM pg_settings WHERE name = 'neon.branch_id'`
  - **Active Branch ID:** `br-fragrant-morning-b35lwkjg` (APPROVED DEVELOPMENT BRANCH)
  - **Production Branch ID:** `br-icy-term-b3lb70tb` (CONFIRMED NOT CONNECTED)
- **Database Name (`current_database()`):** `neondb`
- **Database User (`current_user`):** `neondb_owner`
- **PostgreSQL Engine Version:** PostgreSQL 18.6 (ac70818 on aarch64-unknown-linux-gnu, Neon serverless)

---

## 3. Existing Migration History State

Verified via `schema_migrations` table and `npm run db:migrate:status`:

```
0001_create_users                     applied 2026-11-04T14:25:02.964Z
0002_create_auth_sessions             applied 2026-11-04T14:25:03.519Z
0003_create_idempotency_keys          applied 2026-11-04T14:25:03.998Z
0004_create_user_profiles             applied 2026-11-04T14:38:16.658Z
0005_create_admin_audit_logs          applied 2026-11-05T00:51:45.079Z
0006_create_workouts_and_exercises    applied 2026-11-05T02:15:03.432Z
0007_fix_seed_uuid_compliance         applied 2026-11-05T07:55:09.319Z
0008_create_nutrition_system          applied 2026-11-06T01:08:32.390Z
0009_create_progress_and_measurements applied 2026-11-06T01:08:32.842Z
0010_create_goals_and_habits          applied 2026-11-06T02:34:02.512Z
0011_create_challenges_and_gamification pending
```

None of the 7 Phase 7 tables currently exist in the database catalog:
- `badges`: Not present
- `challenges`: Not present
- `challenge_occurrences`: Not present
- `challenge_enrollments`: Not present
- `user_badges`: Not present
- `gamification_profiles`: Not present
- `gamification_points_ledger`: Not present

---

## 4. Migration 0011 Specification & Constraint Validation

File: `backend/migrations/0011_create_challenges_and_gamification.sql` (148 lines)

### 4.1. Tables & Primary Keys (All UUID v4)
1. **`badges`**: Catalog of unlockable achievement badges.
   - Primary Key: `id uuid DEFAULT gen_random_uuid()`
   - Unique: `slug varchar(100) UNIQUE`
   - Constraints: Valid categories (`workout`, `streak`, `nutrition`, `strength`, `milestone`, `challenge`), valid tiers (`bronze`, `silver`, `gold`, `platinum`, `special`), `points_value >= 0`.
2. **`challenges`**: Core challenge definitions.
   - Primary Key: `id uuid DEFAULT gen_random_uuid()`
   - Unique: `slug varchar(100) UNIQUE`
   - Constraints: Valid cadences (`daily`, `weekly`, `monthly`, `special`, `custom`), valid categories (`workout`, `habit`, `nutrition`, `hydration`, `mixed`), valid metric types (all 9 domain types), `target_value > 0`, `reward_points >= 0`, valid statuses (`draft`, `published`, `archived`).
   - Foreign Key: `reward_badge_id REFERENCES badges (id) ON DELETE SET NULL`.
3. **`challenge_occurrences`**: Time-boxed challenge execution windows.
   - Primary Key: `id uuid DEFAULT gen_random_uuid()`
   - Foreign Key: `challenge_id REFERENCES challenges (id) ON DELETE CASCADE`.
   - Constraints: `chk_occurrence_period CHECK (period_end > period_start)`.
   - Unique: `(challenge_id, period_start)` and `(challenge_id, occurrence_key)`.
4. **`challenge_enrollments`**: User participation and progress tracking.
   - Primary Key: `id uuid DEFAULT gen_random_uuid()`
   - Foreign Keys:
     - `user_id REFERENCES users (id) ON DELETE CASCADE`
     - `occurrence_id REFERENCES challenge_occurrences (id) ON DELETE CASCADE`
     - `challenge_id REFERENCES challenges (id) ON DELETE CASCADE`
   - Constraints: `current_progress >= 0`, `target_value > 0`, valid statuses.
   - Unique: `uq_enrollment_user_occurrence UNIQUE (user_id, occurrence_id)`.
5. **`user_badges`**: Badges unlocked by users.
   - Primary Key: `id uuid DEFAULT gen_random_uuid()`
   - Foreign Keys:
     - `user_id REFERENCES users (id) ON DELETE CASCADE`
     - `badge_id REFERENCES badges (id) ON DELETE CASCADE`
   - Constraints: Valid trigger types.
   - Unique: `uq_user_badge UNIQUE (user_id, badge_id)` (strictly prevents duplicate awards).
6. **`gamification_profiles`**: User gamification stats roll-up.
   - Primary Key: `user_id REFERENCES users (id) ON DELETE CASCADE` (1:1 with `users`).
   - Constraints: `total_points >= 0`, `current_level >= 1`, `badges_count >= 0`, `challenges_won >= 0`.
7. **`gamification_points_ledger`**: Append-only transaction ledger.
   - Primary Key: `id uuid DEFAULT gen_random_uuid()`
   - Foreign Key: `user_id REFERENCES users (id) ON DELETE CASCADE`.
   - Constraints: `points > 0`, valid source types.
   - Unique: `uq_user_point_source UNIQUE (user_id, source_type, source_id)` (idempotency key guaranteeing points are never credited twice for the same event).

### 4.2. Performance Indexes
- `idx_badges_category_tier` on `badges (category, tier) WHERE is_active = true`
- `idx_challenges_cadence_status` on `challenges (cadence, status) WHERE deleted_at IS NULL`
- `idx_challenges_metric_type` on `challenges (metric_type) WHERE deleted_at IS NULL`
- `idx_challenge_occurrences_challenge_dates` on `challenge_occurrences (challenge_id, period_start DESC, period_end DESC)`
- `idx_challenge_occurrences_status` on `challenge_occurrences (status, period_end DESC)`
- `idx_enrollments_user_status` on `challenge_enrollments (user_id, status)`
- `idx_enrollments_occurrence` on `challenge_enrollments (occurrence_id)`
- `idx_enrollments_challenge_user` on `challenge_enrollments (challenge_id, user_id)`
- `idx_user_badges_user_earned` on `user_badges (user_id, earned_at DESC)`
- `idx_gamification_ledger_user` on `gamification_points_ledger (user_id, created_at DESC)`

### 4.3. Initial Seed Badges
Seeds 7 foundational badges (`strength_pr_first`, `workout_consistency_16`, `weight_loss_10kg`, `habit_streak_7`, `habit_streak_30`, `workout_century_100`, `hydration_hero`) using `ON CONFLICT (slug) DO NOTHING`, ensuring complete idempotency.

---

## 5. Compatibility & Existing Data Preservation

1. **Foreign Key Integrity:**
   - All references to `users (id)` align with the existing `users` table where `id` is `uuid NOT NULL PRIMARY KEY`.
2. **Zero Modification to Existing Data:**
   - No columns in `users`, `workouts`, `food_entries`, `weight_entries`, `goals`, `habits`, or `admin_audit_logs` are altered or dropped.
   - No locks will be taken on existing application tables other than foreign key check validation during inserts.
3. **Execution Concurrency Safety:**
   - The migration runner acquires advisory lock `72410318` (`SELECT pg_advisory_lock(...)`) to prevent race conditions during multi-instance deployment.

---

## 6. Rollback & Recovery Strategy

### Automatic Rollback
Migration 0011 does not have the `-- migrate:no-transaction` directive, meaning the migration runner executes it inside an atomic transaction:
```sql
BEGIN;
-- DDL & DML statements
INSERT INTO schema_migrations (version, name, checksum, execution_ms) ...;
COMMIT;
```
If any error occurs during execution, the database engine executes `ROLLBACK`, leaving the schema in its exact pre-migration state.

### Manual Reversal (if needed post-application)
Because Phase 7 tables only receive foreign keys from internal Phase 7 tables, teardown is fully decoupled from Phases 1–6:
```sql
BEGIN;
DROP TABLE IF EXISTS gamification_points_ledger CASCADE;
DROP TABLE IF EXISTS gamification_profiles CASCADE;
DROP TABLE IF EXISTS user_badges CASCADE;
DROP TABLE IF EXISTS challenge_enrollments CASCADE;
DROP TABLE IF EXISTS challenge_occurrences CASCADE;
DROP TABLE IF EXISTS challenges CASCADE;
DROP TABLE IF EXISTS badges CASCADE;
DELETE FROM schema_migrations WHERE version = 11;
COMMIT;
```

---

## 7. Backup & Recovery Readiness

1. **Neon Native Point-In-Time Restore (PITR):**
   - The development branch `br-fragrant-morning-b35lwkjg` maintains continuous WAL logs on Neon, allowing instant PITR restoration to any minute prior to migration execution.
2. **Optional Instant Branch Backup:**
   - If desired prior to execution, a copy-on-write child branch can be created in seconds via the Neon Console or CLI:
     ```bash
     neonctl branches create --name backup-pre-0011 --parent br-fragrant-morning-b35lwkjg
     ```
   - (Note: No branches were created or modified during this read-only audit.)

---

## 8. Risk Assessment

| Risk Category | Level | Mitigation |
| :--- | :--- | :--- |
| **Accidental Production Mutation** | **ZERO RISK** | Connected host confirmed as `br-fragrant-morning-b35lwkjg`. Script explicitly checks branch ID. |
| **Existing Table Lock Contention** | **ZERO RISK** | Only `CREATE TABLE` and `CREATE INDEX` on new tables. |
| **Data Loss on Existing Tables** | **ZERO RISK** | Purely additive migration. |
| **Partial Application Failure** | **ZERO RISK** | Transactional runner guarantees atomic `COMMIT` or `ROLLBACK`. |
| **Duplicate Application** | **ZERO RISK** | `schema_migrations` primary key on `version = 11` + advisory lock prevents re-execution. |

---

## 9. Execution Command & Recommendation

### Recommendation: **GO (Safe to Apply to Neon DEVELOPMENT)**

When approved, execute migration 0011 against the development database using the audited release runner:

```bash
npm --prefix backend run db:migrate
```

Followed by status verification:
```bash
npm --prefix backend run db:migrate:status
```

