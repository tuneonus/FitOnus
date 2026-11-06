/**
 * Database Seed: Populates the official 14 approved exercises and 3 system starter templates.
 * Enforces zero-fabrication: only verified biomechanical fitness movements from project specs.
 */
import { loadDatabaseConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';

interface SeedExercise {
  id: string;
  name: string;
  description: string;
  instructions: string[];
  tips: string[];
  commonMistakes: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isCompound: boolean;
}

const APPROVED_EXERCISES: SeedExercise[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    name: 'Barbell Bench Press',
    description:
      'Fundamental horizontal push compound movement targeting the pectoral muscles, front delts, and triceps.',
    instructions: [
      'Lie on the bench with eyes under the bar and feet planted firmly on the floor.',
      'Grip slightly wider than shoulders, squeeze shoulder blades together and arch slightly.',
      'Lower the bar under control to mid-chest touch.',
      'Press up and slightly back until arms are locked out.',
    ],
    tips: ['Keep wrists stacked over elbows', 'Drive through your feet', 'Touch chest, do not bounce'],
    commonMistakes: [
      'Flaring elbows to 90 degrees',
      'Bouncing bar off ribcage',
      'Lifting hips off the bench',
    ],
    primaryMuscles: ['Chest'],
    secondaryMuscles: ['Front delts', 'Triceps'],
    equipment: 'Barbell',
    category: 'strength',
    difficulty: 'intermediate',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    name: 'Incline Dumbbell Press',
    description: 'Upper chest hypertrophy builder that increases range of motion compared to barbells.',
    instructions: [
      'Set bench angle to approximately 30 degrees.',
      'Press dumbbells up over upper chest with palms facing forward.',
      'Lower until elbows sit just below the bench line with a deep stretch.',
      'Press back up in a slight arc to near lockout.',
    ],
    tips: ['Slight elbow tuck at ~45 degrees', 'Control the eccentric descent', 'Squeeze at the top'],
    commonMistakes: ['Setting bench angle too high (>45 degrees)', 'Clanking dumbbells together at peak'],
    primaryMuscles: ['Chest'],
    secondaryMuscles: ['Front delts', 'Triceps'],
    equipment: 'Dumbbell',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003',
    name: 'Cable Crossover',
    description: 'Isolation chest movement maintaining continuous tension through peak contraction.',
    instructions: [
      'Set cable pulleys at shoulder height or high position.',
      'Step forward into a staggered stance with a slight forward lean and soft elbows.',
      'Bring hands together in a wide hugging arc.',
      'Slowly return to full stretch without altering elbow angle.',
    ],
    tips: ['Think about hugging a tree', 'Squeeze chest hard at the midpoint', 'Keep shoulders pinned down'],
    commonMistakes: ['Bending and extending elbows like a press', 'Using excessive torso momentum'],
    primaryMuscles: ['Chest'],
    secondaryMuscles: ['Front delts'],
    equipment: 'Cable',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: false,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000004',
    name: 'Overhead Cable Triceps Extension',
    description: 'Triceps long-head isolation targeting deep elbow flexion stretch.',
    instructions: [
      'Face away from cable pulley with rope attachment held overhead.',
      'Hinge forward slightly at the hips, keeping upper arms fixed near ears.',
      'Extend elbows fully to lock out overhead.',
      'Return slowly to a deep stretch behind the head.',
    ],
    tips: ['Keep elbows pointed forward', 'Control the stretch behind head'],
    commonMistakes: ['Flaring elbows outward excessively', 'Swinging shoulders to initiate extension'],
    primaryMuscles: ['Arms'],
    secondaryMuscles: ['Triceps'],
    equipment: 'Cable',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: false,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000005',
    name: 'Parallel Bar Dips',
    description: 'Classic calisthenics compound movement developing chest and triceps pushing power.',
    instructions: [
      'Support yourself upright on parallel dip bars with arms locked.',
      'Lean torso slightly forward to bias chest involvement.',
      'Lower under control until shoulders sit just below elbows.',
      'Press firmly back up through palms to lockout.',
    ],
    tips: ['Lean forward ~15-20 degrees for chest emphasis', 'Keep core braced and legs steady'],
    commonMistakes: ['Shrugging shoulders near ears', 'Incomplete depth or bouncing at the bottom'],
    primaryMuscles: ['Chest'],
    secondaryMuscles: ['Triceps', 'Front delts'],
    equipment: 'Bodyweight',
    category: 'strength',
    difficulty: 'intermediate',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000006',
    name: 'Dumbbell Lateral Raise',
    description: 'Premier lateral deltoid builder essential for developing shoulder width.',
    instructions: [
      'Stand tall with dumbbells held at sides with neutral grip.',
      'With slight elbow bend, raise arms outward to shoulder height.',
      'Pause momentarily at the top, then lower with a 2-second eccentric.',
    ],
    tips: ['Lead with elbows rather than hands', 'Pour the pitcher slightly at peak', 'Keep traps relaxed'],
    commonMistakes: ['Swinging torso or using momentum', 'Raising arms way above shoulder level'],
    primaryMuscles: ['Shoulders'],
    secondaryMuscles: [],
    equipment: 'Dumbbell',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: false,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000007',
    name: 'Back Squat',
    description:
      'King of lower-body compound movements building quadriceps, glutes, and spinal erector strength.',
    instructions: [
      'Rest barbell securely across upper trapezius with feet shoulder-width apart.',
      'Take deep breath, brace core, and sit hips down and back.',
      'Descend until hip crease drops below knees (parallel depth).',
      'Drive forcefully upward through mid-foot to starting position.',
    ],
    tips: [
      'Knees track over toes',
      'Maintain neutral spine throughout',
      'Brace 360 degrees before descending',
    ],
    commonMistakes: ['Knees caving inward (valgus)', 'Rounding lower back (butt wink) under load'],
    primaryMuscles: ['Legs'],
    secondaryMuscles: ['Glutes', 'Core', 'Hamstrings'],
    equipment: 'Barbell',
    category: 'strength',
    difficulty: 'intermediate',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000008',
    name: 'Romanian Deadlift',
    description: 'Posterior chain hinge movement prioritizing hamstring and glute development.',
    instructions: [
      'Hold barbell at hip level with overhand grip and slight knee unlock.',
      'Hinge at hips, pushing glutes backward while keeping bar close to legs.',
      'Lower until hamstrings feel full stretch (usually mid-shin).',
      'Drive hips forward to return to standing position, squeezing glutes.',
    ],
    tips: ['Push hips back like closing a car door with glutes', 'Keep spine strictly neutral'],
    commonMistakes: ['Squatting down instead of hinging', 'Letting bar drift away from shins'],
    primaryMuscles: ['Legs'],
    secondaryMuscles: ['Glutes', 'Lower back', 'Hamstrings'],
    equipment: 'Barbell',
    category: 'strength',
    difficulty: 'intermediate',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000009',
    name: 'Pull-up',
    description: 'Essential bodyweight vertical pull building latissimus dorsi and upper back thickness.',
    instructions: [
      'Grasp overhead bar with overhand grip slightly wider than shoulders.',
      'Start from full dead hang with scapulae engaged.',
      'Drive elbows down toward hips to pull upper chest to the bar.',
      'Lower with control back to complete hang.',
    ],
    tips: ['Think about driving elbows down into your back pockets', 'Avoid kipping or swinging legs'],
    commonMistakes: ['Partial reps without full extension', 'Reaching with chin instead of pulling chest'],
    primaryMuscles: ['Back'],
    secondaryMuscles: ['Biceps', 'Forearms', 'Core'],
    equipment: 'Bodyweight',
    category: 'strength',
    difficulty: 'intermediate',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000010',
    name: 'Seated Cable Row',
    description: 'Horizontal pulling exercise strengthening mid-back, rhomboids, and rear delts.',
    instructions: [
      'Sit on rowing bench with feet planted on footplates and knees slightly bent.',
      'Grip V-bar handle with neutral spine and chest elevated.',
      'Pull handle to lower ribs while driving shoulder blades back together.',
      'Extend arms with control to full stretch.',
    ],
    tips: ['Keep chest proud and shoulders depressed', 'Squeeze shoulder blades for 1 second at contraction'],
    commonMistakes: ['Excessive rocking back and forth', 'Rounding lower back during reach phase'],
    primaryMuscles: ['Back'],
    secondaryMuscles: ['Biceps', 'Rear delts'],
    equipment: 'Cable',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000011',
    name: 'Goblet Squat',
    description: 'Front-loaded squat variation ideal for perfecting depth and upright posture.',
    instructions: [
      'Hold kettlebell or dumbbell vertically against chest with both hands.',
      'Set stance slightly wider than shoulder width with toes angled outward.',
      'Squat between knees, tracking knees outward and keeping chest tall.',
      'Drive through heels to stand upright.',
    ],
    tips: ['Keep elbows tucked inside knees at bottom of squat', 'Maintain upright torso posture'],
    commonMistakes: ['Dropping kettlebell away from chest', 'Heels lifting off the ground'],
    primaryMuscles: ['Legs'],
    secondaryMuscles: ['Core', 'Glutes'],
    equipment: 'Kettlebell',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000012',
    name: 'Plank',
    description: 'Isometric anterior core exercise reinforcing spinal stabilization and anti-extension.',
    instructions: [
      'Position forearms on floor directly under shoulders.',
      'Extend legs back with toes tucked, creating straight line from head to heels.',
      'Squeeze glutes, brace abdominals, and hold position without hip sag.',
    ],
    tips: [
      'Tuck pelvis slightly to engage lower abs',
      'Breathe steadily while maintaining abdominal tension',
    ],
    commonMistakes: ['Sagging lower back towards floor', 'Piking hips upward into a tent shape'],
    primaryMuscles: ['Core'],
    secondaryMuscles: ['Shoulders', 'Glutes'],
    equipment: 'Bodyweight',
    category: 'strength',
    difficulty: 'beginner',
    isCompound: false,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000013',
    name: 'Burpee',
    description: 'Full-body metabolic conditioning movement integrating squat thrust, push-up, and jump.',
    instructions: [
      'From standing, drop into a squat and place hands on floor.',
      'Kick feet back into a plank position and lower chest to floor.',
      'Press up, jump feet forward toward hands, and explosively jump into air with hands overhead.',
    ],
    tips: ['Pace breathing steadily across sets', 'Land softly on midfoot to absorb impact'],
    commonMistakes: ['Arching lower back into hyperextension during plank drop', 'Landing heavily on heels'],
    primaryMuscles: ['Full body'],
    secondaryMuscles: ['Cardio', 'Chest', 'Legs', 'Core'],
    equipment: 'Bodyweight',
    category: 'hiit',
    difficulty: 'beginner',
    isCompound: true,
  },
  {
    id: 'e0000000-0000-4000-8000-000000000014',
    name: 'Kettlebell Swing',
    description: 'Dynamic hip hinge generating explosive power from hamstrings, glutes, and hips.',
    instructions: [
      'Stand with feet shoulder-width apart, kettlebell placed on floor ahead.',
      'Hinge hips back, grasp bell, and hike it back between thighs.',
      'Snap hips forward explosively to propel bell upward to chest level.',
      'Let bell swing back under control into next repetition.',
    ],
    tips: ['Drive with hip snap, not shoulder lifting', 'Lock out knees and glutes at the top'],
    commonMistakes: ['Squatting down instead of hip hinging', 'Lifting bell with arms instead of hip power'],
    primaryMuscles: ['Full body'],
    secondaryMuscles: ['Glutes', 'Hamstrings', 'Lower back'],
    equipment: 'Kettlebell',
    category: 'strength',
    difficulty: 'intermediate',
    isCompound: true,
  },
];

interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  workoutType: string;
  estimatedDurationMinutes: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  exercises: {
    exerciseId: string;
    orderIndex: number;
    targetSets: number;
    targetReps: string;
    targetWeightKg: number;
    restSeconds: number;
    notes?: string;
  }[];
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'Chest + Triceps Starter',
    description: 'System curated push routine for upper body strength and pectoral hypertrophy.',
    workoutType: 'strength',
    estimatedDurationMinutes: 52,
    difficulty: 'intermediate',
    tags: ['Push', 'Hypertrophy'],
    exercises: [
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000001',
        orderIndex: 0,
        targetSets: 4,
        targetReps: '6-8',
        targetWeightKg: 72.5,
        restSeconds: 120,
        notes: 'Work up to heavy set',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000002',
        orderIndex: 1,
        targetSets: 3,
        targetReps: '10',
        targetWeightKg: 26.0,
        restSeconds: 90,
        notes: 'Focus on upper chest stretch',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000003',
        orderIndex: 2,
        targetSets: 3,
        targetReps: '12',
        targetWeightKg: 15.0,
        restSeconds: 60,
        notes: 'Constant cable tension',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000004',
        orderIndex: 3,
        targetSets: 3,
        targetReps: '12',
        targetWeightKg: 20.0,
        restSeconds: 60,
        notes: 'Deep stretch at bottom',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000005',
        orderIndex: 4,
        targetSets: 3,
        targetReps: 'AMRAP',
        targetWeightKg: 0,
        restSeconds: 90,
        notes: 'Bodyweight finish',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000006',
        orderIndex: 5,
        targetSets: 3,
        targetReps: '15',
        targetWeightKg: 8.0,
        restSeconds: 45,
        notes: 'Strict form, lead with elbows',
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    name: 'Back + Biceps Starter',
    description: 'System curated pull routine focusing on lat width, mid-back density, and posterior chain.',
    workoutType: 'strength',
    estimatedDurationMinutes: 45,
    difficulty: 'intermediate',
    tags: ['Pull', 'Upper Body'],
    exercises: [
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000009',
        orderIndex: 0,
        targetSets: 4,
        targetReps: '8-10',
        targetWeightKg: 0,
        restSeconds: 90,
        notes: 'Dead hang to chest touch',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000010',
        orderIndex: 1,
        targetSets: 3,
        targetReps: '10-12',
        targetWeightKg: 55.0,
        restSeconds: 60,
        notes: 'Squeeze shoulder blades',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000008',
        orderIndex: 2,
        targetSets: 3,
        targetReps: '8-10',
        targetWeightKg: 80.0,
        restSeconds: 120,
        notes: 'Feel hamstring stretch',
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    name: 'Legs + Core Starter',
    description: 'System curated lower body workout targeting quads, glutes, and core stability.',
    workoutType: 'strength',
    estimatedDurationMinutes: 48,
    difficulty: 'intermediate',
    tags: ['Legs', 'Lower Body'],
    exercises: [
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000007',
        orderIndex: 0,
        targetSets: 4,
        targetReps: '6-8',
        targetWeightKg: 90.0,
        restSeconds: 120,
        notes: 'Hit parallel depth',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000008',
        orderIndex: 1,
        targetSets: 3,
        targetReps: '8-10',
        targetWeightKg: 80.0,
        restSeconds: 90,
        notes: 'Hips back, neutral back',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000011',
        orderIndex: 2,
        targetSets: 3,
        targetReps: '12',
        targetWeightKg: 24.0,
        restSeconds: 60,
        notes: 'Stay upright',
      },
      {
        exerciseId: 'e0000000-0000-4000-8000-000000000012',
        orderIndex: 3,
        targetSets: 3,
        targetReps: '60s',
        targetWeightKg: 0,
        restSeconds: 45,
        notes: 'Solid pelvic tilt',
      },
    ],
  },
];

async function main(): Promise<void> {
  const pool = createPool(loadDatabaseConfig());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Seeding official 14 approved exercises...');

    for (const ex of APPROVED_EXERCISES) {
      await client.query(
        `
        INSERT INTO exercises (
          id, name, description, instructions, tips, common_mistakes,
          primary_muscles, secondary_muscles, equipment, category,
          difficulty, is_compound, is_system, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          instructions = EXCLUDED.instructions,
          tips = EXCLUDED.tips,
          common_mistakes = EXCLUDED.common_mistakes,
          primary_muscles = EXCLUDED.primary_muscles,
          secondary_muscles = EXCLUDED.secondary_muscles,
          equipment = EXCLUDED.equipment,
          category = EXCLUDED.category,
          difficulty = EXCLUDED.difficulty,
          is_compound = EXCLUDED.is_compound,
          updated_at = NOW()
        `,
        [
          ex.id,
          ex.name,
          ex.description,
          JSON.stringify(ex.instructions),
          JSON.stringify(ex.tips),
          JSON.stringify(ex.commonMistakes),
          ex.primaryMuscles,
          ex.secondaryMuscles,
          ex.equipment,
          ex.category,
          ex.difficulty,
          ex.isCompound,
        ],
      );
    }
    console.log(`Successfully seeded ${APPROVED_EXERCISES.length} legitimate exercises.`);

    console.log('Seeding official 3 system starter templates...');
    for (const tmpl of STARTER_TEMPLATES) {
      await client.query(
        `
        INSERT INTO workouts (
          id, user_id, name, description, workout_type,
          estimated_duration_minutes, difficulty, is_template,
          is_ai_generated, tags, created_at, updated_at
        )
        VALUES ($1, NULL, $2, $3, $4, $5, $6, true, false, $7, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          workout_type = EXCLUDED.workout_type,
          estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
          difficulty = EXCLUDED.difficulty,
          tags = EXCLUDED.tags,
          updated_at = NOW()
        `,
        [
          tmpl.id,
          tmpl.name,
          tmpl.description,
          tmpl.workoutType,
          tmpl.estimatedDurationMinutes,
          tmpl.difficulty,
          tmpl.tags,
        ],
      );

      // Re-seed template exercises
      await client.query(`DELETE FROM workout_exercises WHERE workout_id = $1`, [tmpl.id]);
      for (const ex of tmpl.exercises) {
        await client.query(
          `
          INSERT INTO workout_exercises (
            id, workout_id, exercise_id, order_index, target_sets,
            target_reps, target_weight_kg, rest_seconds, notes, created_at
          )
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `,
          [
            tmpl.id,
            ex.exerciseId,
            ex.orderIndex,
            ex.targetSets,
            ex.targetReps,
            ex.targetWeightKg,
            ex.restSeconds,
            ex.notes ?? null,
          ],
        );
      }
    }
    console.log(`Successfully seeded ${STARTER_TEMPLATES.length} system starter templates.`);

    await client.query('COMMIT');
    console.log('Workout seeding completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed, rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
