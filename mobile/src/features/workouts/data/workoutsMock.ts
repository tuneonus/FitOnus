import { images } from '../../../shared/constants/images';
import type { Exercise, WorkoutCategory, WorkoutLog, WorkoutSession } from '../types/workout';

export const exercises: Exercise[] = [
{
  id: 'bench',
  name: 'Barbell Bench Press',
  muscle: 'Chest',
  equipment: 'Barbell',
  level: 'Intermediate',
  secondary: ['Front delts', 'Triceps'],
  image: images.benchPress,
  instructions: [
  'Lie on the bench with eyes under the bar and feet planted.',
  'Grip slightly wider than shoulders, squeeze shoulder blades together.',
  'Lower the bar under control to mid-chest.',
  'Press up and slightly back until arms are locked out.'],

  cues: ['Keep wrists stacked over elbows', 'Drive through your feet', 'Touch, don’t bounce']
},
{ id: 'incline-db', name: 'Incline Dumbbell Press', muscle: 'Chest', equipment: 'Dumbbell', level: 'Beginner', secondary: ['Front delts', 'Triceps'], instructions: ['Set bench to 30°.', 'Press dumbbells up over upper chest.', 'Lower until elbows sit just below the bench line.'], cues: ['Slight elbow tuck', 'Control the eccentric'] },
{ id: 'cable-fly', name: 'Cable Crossover', muscle: 'Chest', equipment: 'Cable', level: 'Beginner', secondary: ['Front delts'], instructions: ['Set pulleys at shoulder height.', 'Step forward, slight bend in elbows.', 'Bring hands together in a wide arc.'], cues: ['Hug a tree', 'Squeeze at the middle'] },
{ id: 'oh-tricep', name: 'Overhead Cable Triceps Extension', muscle: 'Arms', equipment: 'Cable', level: 'Beginner', secondary: [], instructions: ['Face away from the cable with rope overhead.', 'Extend elbows fully.', 'Return slowly to a deep stretch.'], cues: ['Elbows stay pointed forward'] },
{ id: 'dips', name: 'Parallel Bar Dips', muscle: 'Chest', equipment: 'Bodyweight', level: 'Intermediate', secondary: ['Triceps'], instructions: ['Support yourself on the bars.', 'Lower until shoulders are just below elbows.', 'Press back to lockout.'], cues: ['Lean slightly forward for chest'] },
{ id: 'lateral', name: 'Dumbbell Lateral Raise', muscle: 'Shoulders', equipment: 'Dumbbell', level: 'Beginner', secondary: [], instructions: ['Stand tall with dumbbells at sides.', 'Raise out to shoulder height.', 'Lower slowly.'], cues: ['Lead with elbows'] },
{ id: 'squat', name: 'Back Squat', muscle: 'Legs', equipment: 'Barbell', level: 'Intermediate', secondary: ['Glutes', 'Core'], instructions: ['Bar on upper back, feet shoulder width.', 'Sit down and back to depth.', 'Drive up through mid-foot.'], cues: ['Knees track toes', 'Brace before each rep'] },
{ id: 'rdl', name: 'Romanian Deadlift', muscle: 'Legs', equipment: 'Barbell', level: 'Intermediate', secondary: ['Glutes', 'Lower back'], instructions: ['Hinge at hips with soft knees.', 'Lower bar along thighs.', 'Stand tall squeezing glutes.'], cues: ['Neutral spine'] },
{ id: 'pullup', name: 'Pull-up', muscle: 'Back', equipment: 'Bodyweight', level: 'Intermediate', secondary: ['Biceps'], instructions: ['Hang with overhand grip.', 'Pull chest toward the bar.', 'Lower to full hang.'], cues: ['Drive elbows down'] },
{ id: 'row', name: 'Seated Cable Row', muscle: 'Back', equipment: 'Cable', level: 'Beginner', secondary: ['Biceps', 'Rear delts'], instructions: ['Sit tall, slight knee bend.', 'Pull handle to lower ribs.', 'Return with control.'], cues: ['Chest proud'] },
{ id: 'goblet', name: 'Goblet Squat', muscle: 'Legs', equipment: 'Kettlebell', level: 'Beginner', secondary: ['Core'], instructions: ['Hold kettlebell at chest.', 'Squat between your knees.', 'Stand tall.'], cues: ['Elbows inside knees'] },
{ id: 'plank', name: 'Plank', muscle: 'Core', equipment: 'Bodyweight', level: 'Beginner', secondary: ['Shoulders'], instructions: ['Forearms under shoulders.', 'Hold a straight line from head to heels.'], cues: ['Squeeze glutes'] },
{ id: 'burpee', name: 'Burpee', muscle: 'Full body', equipment: 'Bodyweight', level: 'Beginner', secondary: ['Cardio'], instructions: ['Squat, kick back to plank.', 'Return and jump.'], cues: ['Land softly'] },
{ id: 'kb-swing', name: 'Kettlebell Swing', muscle: 'Full body', equipment: 'Kettlebell', level: 'Intermediate', secondary: ['Glutes', 'Hamstrings'], instructions: ['Hinge and hike the bell back.', 'Snap hips to float bell to chest height.'], cues: ['Hips, not arms'] }];


export const exerciseById = (id: string): Exercise => exercises.find((e) => e.id === id) ?? exercises[0]!;

export const todaySession: WorkoutSession = {
  id: 'push-a',
  title: 'Chest + Triceps',
  focus: 'Push · Week 3 of 8',
  durationMin: 52,
  intensity: 'Moderate–high',
  exercises: [
  { exerciseId: 'bench', sets: 4, reps: '6–8', weight: 72.5, restSec: 120 },
  { exerciseId: 'incline-db', sets: 3, reps: '10', weight: 26, restSec: 90 },
  { exerciseId: 'cable-fly', sets: 3, reps: '12', weight: 15, restSec: 60 },
  { exerciseId: 'oh-tricep', sets: 3, reps: '12', weight: 20, restSec: 60 },
  { exerciseId: 'dips', sets: 3, reps: 'AMRAP', weight: 0, restSec: 90 },
  { exerciseId: 'lateral', sets: 3, reps: '15', weight: 8, restSec: 45 }]

};

export const generatedFatLossSession: WorkoutSession = {
  id: 'ai-fatloss-45',
  title: 'Metabolic Full Body',
  focus: 'AI plan · Fat loss',
  durationMin: 45,
  intensity: 'Moderate',
  exercises: [
  { exerciseId: 'goblet', sets: 4, reps: '12', weight: 20, restSec: 45 },
  { exerciseId: 'kb-swing', sets: 4, reps: '15', weight: 16, restSec: 45 },
  { exerciseId: 'row', sets: 3, reps: '12', weight: 45, restSec: 45 },
  { exerciseId: 'incline-db', sets: 3, reps: '12', weight: 20, restSec: 45 },
  { exerciseId: 'burpee', sets: 3, reps: '10', weight: 0, restSec: 30 },
  { exerciseId: 'plank', sets: 3, reps: '45 s', weight: 0, restSec: 30 }]

};

export const program = {
  name: 'Push Pull Legs · Hypertrophy',
  week: 3,
  totalWeeks: 8,
  sessionsDone: 14,
  sessionsTotal: 40
};

export const weekSchedule = [
{ day: 'Sat', date: 3, label: 'Legs', status: 'done' as const },
{ day: 'Sun', date: 4, label: 'Rest', status: 'rest' as const },
{ day: 'Mon', date: 5, label: 'Push', status: 'done' as const },
{ day: 'Tue', date: 6, label: 'Pull', status: 'done' as const },
{ day: 'Wed', date: 7, label: 'Legs', status: 'missed' as const },
{ day: 'Thu', date: 8, label: 'Upper', status: 'done' as const },
{ day: 'Fri', date: 9, label: 'Push', status: 'today' as const }];


export const workoutCategories: {name: WorkoutCategory;detail: string;plans: number;}[] = [
{ name: 'Push Pull Legs', detail: '6 days · Hypertrophy', plans: 3 },
{ name: 'Upper Lower Split', detail: '4 days · Strength + size', plans: 2 },
{ name: 'Full Body', detail: '3 days · Efficient', plans: 4 },
{ name: 'Fat Loss', detail: 'Circuits · Conditioning', plans: 5 },
{ name: 'Muscle Gain', detail: 'Progressive overload', plans: 4 },
{ name: 'Strength', detail: '5×5 · Powerbuilding', plans: 3 },
{ name: 'Home Workout', detail: 'Dumbbells · Bodyweight', plans: 6 },
{ name: 'Gym Workout', detail: 'Full equipment', plans: 8 },
{ name: 'Custom Plans', detail: 'Built by you or Coach', plans: 1 }];


export const initialWorkoutHistory: WorkoutLog[] = [
{ id: 'w1', date: 'Thu, Oct 8', title: 'Upper Body', durationMin: 58, volumeKg: 9820, sets: 20, prs: 0, calories: 410, avgHr: 124, source: 'FitOnus', exercises: [{ name: 'Overhead Press', best: '45 kg × 6' }, { name: 'Pull-up', best: 'BW × 9' }, { name: 'Incline Dumbbell Press', best: '26 kg × 10' }] },
{ id: 'w2', date: 'Tue, Oct 6', title: 'Back + Biceps', durationMin: 51, volumeKg: 8640, sets: 18, prs: 1, calories: 372, avgHr: 119, source: 'Apple Watch', exercises: [{ name: 'Barbell Row', best: '70 kg × 8 · PR' }, { name: 'Seated Cable Row', best: '60 kg × 12' }] },
{ id: 'w3', date: 'Mon, Oct 5', title: 'Chest + Triceps', durationMin: 54, volumeKg: 10120, sets: 19, prs: 1, calories: 398, avgHr: 121, source: 'FitOnus', exercises: [{ name: 'Barbell Bench Press', best: '72.5 kg × 6 · PR' }, { name: 'Cable Crossover', best: '15 kg × 12' }] },
{ id: 'w4', date: 'Sat, Oct 3', title: 'Legs', durationMin: 62, volumeKg: 13400, sets: 21, prs: 0, calories: 468, avgHr: 128, source: 'FitOnus', exercises: [{ name: 'Back Squat', best: '100 kg × 5' }, { name: 'Romanian Deadlift', best: '90 kg × 8' }] },
{ id: 'w5', date: 'Thu, Oct 1', title: 'Easy Run 5K', durationMin: 31, volumeKg: 0, sets: 0, prs: 0, calories: 340, avgHr: 148, source: 'Apple Watch', exercises: [{ name: 'Outdoor run', best: '5.02 km · 6:10 /km' }] }];


export const personalRecords = [
{ lift: 'Barbell Bench Press', best: '72.5 kg × 6', e1rm: 85, date: 'Oct 5', history: [62.5, 65, 65, 67.5, 70, 70, 72.5] },
{ lift: 'Back Squat', best: '100 kg × 5', e1rm: 113, date: 'Sep 26', history: [85, 90, 92.5, 95, 97.5, 100, 100] },
{ lift: 'Romanian Deadlift', best: '90 kg × 8', e1rm: 112, date: 'Oct 3', history: [70, 75, 80, 82.5, 85, 90, 90] },
{ lift: 'Barbell Row', best: '70 kg × 8', e1rm: 87, date: 'Oct 6', history: [55, 57.5, 60, 62.5, 65, 67.5, 70] },
{ lift: 'Overhead Press', best: '45 kg × 6', e1rm: 53, date: 'Sep 24', history: [37.5, 40, 40, 42.5, 42.5, 45, 45] },
{ lift: '5K run', best: '28:40', e1rm: 0, date: 'Sep 12', history: [] }];


export const weeklyVolume = [
{ label: 'W36', value: 38200 },
{ label: 'W37', value: 41600 },
{ label: 'W38', value: 36900 },
{ label: 'W39', value: 44100 },
{ label: 'W40', value: 42080 }];