export type Exercise = {
  id: string;
  name: string;
  muscle: 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core' | 'Full body' | 'Cardio';
  equipment: 'Barbell' | 'Dumbbell' | 'Cable' | 'Machine' | 'Bodyweight' | 'Kettlebell';
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  secondary: string[];
  instructions: string[];
  cues: string[];
  image?: string;
};

export type PlannedExercise = {
  exerciseId: string;
  sets: number;
  reps: string;
  weight: number; // kg, 0 = bodyweight
  restSec: number;
};

export type WorkoutSession = {
  id: string;
  title: string;
  focus: string;
  durationMin: number;
  intensity: string;
  exercises: PlannedExercise[];
};

export type SetLog = {weight: number;reps: number;done: boolean;};

export type ActiveExercise = {
  exerciseId: string;
  restSec: number;
  targetReps: string;
  sets: SetLog[];
  skipped: boolean;
};

export type WorkoutLog = {
  id: string;
  date: string;
  title: string;
  durationMin: number;
  volumeKg: number;
  sets: number;
  prs: number;
  calories: number;
  avgHr?: number;
  source: 'FitOnus' | 'Apple Watch' | 'Manual';
  exercises: {name: string;best: string;}[];
};

export type WorkoutCategory =
'Fat Loss' |
'Muscle Gain' |
'Strength' |
'Home Workout' |
'Gym Workout' |
'Push Pull Legs' |
'Upper Lower Split' |
'Full Body' |
'Custom Plans';