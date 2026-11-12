-- ==============================================================================
-- FITONUS DEV FRESH START SCRIPT
-- Target Environment: Neon DEV (Branch: br-fragrant-morning-b35lwkjg, Endpoint: ep-shy-art-b3sxwfkd)
-- Purpose: Remove development/test data, zero catalogs, and preserve system essentials.
--
-- STRICT PRESERVATION INVARIANTS:
-- 1. All 15 schema_migrations intact
-- 2. All 7 foundational app_settings intact
-- 3. 1 active gemini_config intact
-- 4. All 8 gemini_pricing tiers intact
-- 5. All 7 foundational system badges intact
-- 6. Exactly 1 approved administrator account (admin@fitonus.com) intact
-- Total Preserved Rows: Exactly 39
-- Total Deleted Rows: Exactly 528
-- Pre-cleanup Grand Total: 567 rows across all 39 tables
--
-- THIS SCRIPT EXECUTES AS A TRANSACTIONAL REHEARSAL ENDING IN ROLLBACK.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PRE-EXECUTION IDENTITY & SAFETY GUARDS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_count int;
    v_admin_id uuid := 'ae1c758b-e47d-4053-ab70-4114c2bfab79'::uuid;
    v_admin_email text := 'admin@fitonus.com';
    v_db_name text;
BEGIN
    SELECT current_database() INTO v_db_name;
    IF v_db_name != 'neondb' THEN
        RAISE EXCEPTION 'SAFETY GUARD TRIGGERED: Expected database neondb, connected to %', v_db_name;
    END IF;

    -- Verify approved admin exists before taking any action
    SELECT count(*) INTO v_admin_count 
    FROM users 
    WHERE id = v_admin_id AND email = v_admin_email AND role = 'admin';

    IF v_admin_count != 1 THEN
        RAISE EXCEPTION 'SAFETY GUARD TRIGGERED: Approved admin % (ID: %) not found!', v_admin_email, v_admin_id;
    END IF;

    RAISE NOTICE 'Safety guards verified: Database=% Admin=% (%)', v_db_name, v_admin_email, v_admin_id;
END $$;

-- ------------------------------------------------------------------------------
-- 2. STEP-BY-STEP FOREIGN KEY RESPECTING DATA CLEANUP
-- ------------------------------------------------------------------------------

-- Step 2.1: Workouts & Exercises (Must delete referencing tables before exercises due to ON DELETE RESTRICT)
DELETE FROM workout_exercises;
DELETE FROM workout_session_sets;
DELETE FROM personal_records;
DELETE FROM workout_sessions;
DELETE FROM workouts;
DELETE FROM exercises;

-- Step 2.2: Nutrition & Foods
DELETE FROM meal_items;
DELETE FROM meals;
DELETE FROM food_favorites;
DELETE FROM foods;

-- Step 2.3: Challenges (Occurrences & Enrollments before Challenges)
DELETE FROM challenge_enrollments;
DELETE FROM challenge_occurrences;
DELETE FROM challenges;

-- Step 2.4: Habits & Goals
DELETE FROM habit_completions;
DELETE FROM habits;
DELETE FROM goal_checkpoints;
DELETE FROM goals;

-- Step 2.5: AI Coach Conversations & Messages
DELETE FROM coach_messages;
DELETE FROM coach_conversations;
DELETE FROM coach_memories;
DELETE FROM gemini_usage_events;
DELETE FROM user_ai_usage;

-- Step 2.6: Gamification (Delete user badge earnings, preserve badges catalog)
DELETE FROM user_badges;
DELETE FROM gamification_points_ledger;
DELETE FROM gamification_profiles;

-- Step 2.7: Health Metrics & Peripheral Telemetry
DELETE FROM water_intake;
DELETE FROM weight_logs;
DELETE FROM body_measurements;
DELETE FROM idempotency_keys;

-- Step 2.8: Audit Logs & Sessions
DELETE FROM admin_audit_logs;
DELETE FROM auth_sessions;

-- Step 2.9: User Profiles & Settings (Preserving admin if any)
DELETE FROM user_profiles WHERE user_id != 'ae1c758b-e47d-4053-ab70-4114c2bfab79'::uuid;
DELETE FROM user_settings WHERE user_id != 'ae1c758b-e47d-4053-ab70-4114c2bfab79'::uuid;

-- Step 2.10: Delete All Non-Admin User Accounts
DELETE FROM users WHERE id != 'ae1c758b-e47d-4053-ab70-4114c2bfab79'::uuid;

-- ------------------------------------------------------------------------------
-- 3. POST-CLEANUP ASSERTIONS & INTEGRITY VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_users_total int;
    v_admin_users int;
    v_non_admin_users int;
    v_exercises int;
    v_foods int;
    v_workouts int;
    v_challenges int;
    v_badges int;
    v_app_settings int;
    v_gemini_config int;
    v_gemini_pricing int;
    v_schema_migrations int;
    v_table_count int;
    v_grand_total bigint := 0;
    r record;
BEGIN
    -- Verify User State
    SELECT count(*) INTO v_users_total FROM users;
    SELECT count(*) INTO v_admin_users FROM users WHERE role = 'admin' AND email = 'admin@fitonus.com';
    SELECT count(*) INTO v_non_admin_users FROM users WHERE role != 'admin' OR email != 'admin@fitonus.com';

    IF v_users_total != 1 OR v_admin_users != 1 OR v_non_admin_users != 0 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: users mismatch (total: %, admin: %, non-admin: %)', v_users_total, v_admin_users, v_non_admin_users;
    END IF;

    -- Verify Zero Catalogs
    SELECT count(*) INTO v_exercises FROM exercises;
    SELECT count(*) INTO v_foods FROM foods;
    SELECT count(*) INTO v_workouts FROM workouts;
    SELECT count(*) INTO v_challenges FROM challenges;

    IF v_exercises != 0 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: exercises remaining: % (expected 0)', v_exercises;
    END IF;
    IF v_foods != 0 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: foods remaining: % (expected 0)', v_foods;
    END IF;
    IF v_workouts != 0 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: workouts remaining: % (expected 0)', v_workouts;
    END IF;
    IF v_challenges != 0 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: challenges remaining: % (expected 0)', v_challenges;
    END IF;

    -- Verify Preserved System Configuration
    SELECT count(*) INTO v_badges FROM badges;
    SELECT count(*) INTO v_app_settings FROM app_settings;
    SELECT count(*) INTO v_gemini_config FROM gemini_config;
    SELECT count(*) INTO v_gemini_pricing FROM gemini_pricing;
    SELECT count(*) INTO v_schema_migrations FROM schema_migrations;

    IF v_badges != 7 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: badges count mismatch: % (expected 7)', v_badges;
    END IF;
    IF v_app_settings != 7 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: app_settings count mismatch: % (expected 7)', v_app_settings;
    END IF;
    IF v_gemini_config != 1 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: gemini_config count mismatch: % (expected 1)', v_gemini_config;
    END IF;
    IF v_gemini_pricing != 8 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: gemini_pricing count mismatch: % (expected 8)', v_gemini_pricing;
    END IF;
    IF v_schema_migrations != 15 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: schema_migrations count mismatch: % (expected 15)', v_schema_migrations;
    END IF;

    -- Compute Grand Total Across All 39 Tables in neondb
    FOR r IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ) LOOP
        EXECUTE format('SELECT count(*) FROM %I', r.table_name) INTO v_table_count;
        v_grand_total := v_grand_total + v_table_count;
    END LOOP;

    IF v_grand_total != 39 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: grand total rows across database is % (expected exactly 39 preserved system rows)', v_grand_total;
    END IF;

    RAISE NOTICE 'TRANSACTIONAL ASSERTIONS PASSED: Exactly 39 preserved system rows remain across all tables. Exactly 528 test rows deleted.';
END $$;

-- ------------------------------------------------------------------------------
-- 4. DRY RUN REHEARSAL ROLLBACK
-- DO NOT CHANGE TO COMMIT WITHOUT EXPLICIT USER APPROVAL COMMAND:
-- "Approve DEV cleanup COMMIT on branch br-fragrant-morning-b35lwkjg."
-- ------------------------------------------------------------------------------
ROLLBACK;
