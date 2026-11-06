-- Migration 0007: Update seeded exercise and template UUIDs to RFC 4122 v4 compliance
-- Ensures version (4) and variant (8) bits conform to RFC 4122 and strict Zod validation

-- 1. Create mapping table for exercises
CREATE TEMP TABLE exercise_uuid_map (
  old_id uuid PRIMARY KEY,
  new_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO exercise_uuid_map (old_id, new_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-4000-8000-000000000003'),
  ('e0000000-0000-0000-0000-000000000004', 'e0000000-0000-4000-8000-000000000004'),
  ('e0000000-0000-0000-0000-000000000005', 'e0000000-0000-4000-8000-000000000005'),
  ('e0000000-0000-0000-0000-000000000006', 'e0000000-0000-4000-8000-000000000006'),
  ('e0000000-0000-0000-0000-000000000007', 'e0000000-0000-4000-8000-000000000007'),
  ('e0000000-0000-0000-0000-000000000008', 'e0000000-0000-4000-8000-000000000008'),
  ('e0000000-0000-0000-0000-000000000009', 'e0000000-0000-4000-8000-000000000009'),
  ('e0000000-0000-0000-0000-000000000010', 'e0000000-0000-4000-8000-000000000010'),
  ('e0000000-0000-0000-0000-000000000011', 'e0000000-0000-4000-8000-000000000011'),
  ('e0000000-0000-0000-0000-000000000012', 'e0000000-0000-4000-8000-000000000012'),
  ('e0000000-0000-0000-0000-000000000013', 'e0000000-0000-4000-8000-000000000013'),
  ('e0000000-0000-0000-0000-000000000014', 'e0000000-0000-4000-8000-000000000014');

-- 2. Create mapping table for workout starter templates
CREATE TEMP TABLE workout_uuid_map (
  old_id uuid PRIMARY KEY,
  new_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO workout_uuid_map (old_id, new_id) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-4000-8000-000000000103');

-- 3. Temporarily drop foreign keys that lack ON UPDATE CASCADE
ALTER TABLE workout_exercises DROP CONSTRAINT IF EXISTS workout_exercises_exercise_id_fkey;
ALTER TABLE workout_exercises DROP CONSTRAINT IF EXISTS workout_exercises_workout_id_fkey;
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_workout_id_fkey;
ALTER TABLE workout_session_sets DROP CONSTRAINT IF EXISTS workout_session_sets_exercise_id_fkey;
ALTER TABLE personal_records DROP CONSTRAINT IF EXISTS personal_records_exercise_id_fkey;

-- 4. Update exercises.id
UPDATE exercises e
SET id = m.new_id, updated_at = now()
FROM exercise_uuid_map m
WHERE e.id = m.old_id;

-- 5. Update workouts.id
UPDATE workouts w
SET id = m.new_id, updated_at = now()
FROM workout_uuid_map m
WHERE w.id = m.old_id;

-- 6. Update dependent tables with matching new IDs
UPDATE workout_exercises we
SET exercise_id = m.new_id
FROM exercise_uuid_map m
WHERE we.exercise_id = m.old_id;

UPDATE workout_exercises we
SET workout_id = m.new_id
FROM workout_uuid_map m
WHERE we.workout_id = m.old_id;

UPDATE workout_sessions ws
SET workout_id = m.new_id
FROM workout_uuid_map m
WHERE ws.workout_id = m.old_id;

UPDATE workout_session_sets wss
SET exercise_id = m.new_id
FROM exercise_uuid_map m
WHERE wss.exercise_id = m.old_id;

UPDATE personal_records pr
SET exercise_id = m.new_id
FROM exercise_uuid_map m
WHERE pr.exercise_id = m.old_id;

-- 7. Re-create foreign keys with ON UPDATE CASCADE
ALTER TABLE workout_exercises
  ADD CONSTRAINT workout_exercises_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES exercises (id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE workout_exercises
  ADD CONSTRAINT workout_exercises_workout_id_fkey
  FOREIGN KEY (workout_id) REFERENCES workouts (id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_workout_id_fkey
  FOREIGN KEY (workout_id) REFERENCES workouts (id)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE workout_session_sets
  ADD CONSTRAINT workout_session_sets_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES exercises (id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE personal_records
  ADD CONSTRAINT personal_records_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES exercises (id)
  ON DELETE CASCADE ON UPDATE CASCADE;
