import { WorkoutTemplate, WorkoutDetail, Exercise } from '../types/workout';

export class WorkoutService {
  static async getTemplates(): Promise<WorkoutTemplate[]> {
    return [
      {
        id: 't1',
        name: 'Full Body Fundamentals',
        description: 'A great starting point for beginners focusing on compound movements.',
        estimatedDuration: 45,
        difficulty: 'Beginner',
        tags: ['Full Body', 'Strength'],
        exercisesCount: 5,
      },
      {
        id: 't2',
        name: 'Push Hypertrophy',
        description: 'Focus on chest, shoulders, and triceps for muscle growth.',
        estimatedDuration: 60,
        difficulty: 'Intermediate',
        tags: ['Push', 'Hypertrophy'],
        exercisesCount: 7,
      },
      {
        id: 't3',
        name: 'Lower Body Power',
        description: 'Heavy squats and deadlifts to build explosive strength.',
        estimatedDuration: 75,
        difficulty: 'Advanced',
        tags: ['Legs', 'Power'],
        exercisesCount: 6,
      }
    ];
  }

  static async getMyWorkouts(): Promise<WorkoutTemplate[]> {
    return [
      {
        id: 'm1',
        name: 'AI Generated: Core & Cardio',
        description: 'Personalized circuit based on your goal to burn fat.',
        estimatedDuration: 30,
        difficulty: 'Intermediate',
        tags: ['Core', 'Cardio', 'HIIT'],
        exercisesCount: 8,
        isAiGenerated: true,
      },
      {
        id: 'm2',
        name: 'My Custom Pull Day',
        description: 'Back and biceps routine focusing on lat width.',
        estimatedDuration: 55,
        difficulty: 'Intermediate',
        tags: ['Pull', 'Hypertrophy'],
        exercisesCount: 6,
      }
    ];
  }

  static async getWorkoutDetail(id: string): Promise<WorkoutDetail> {
    const mockExercise: Exercise = {
      id: 'e1',
      name: 'Barbell Bench Press',
      primaryMuscles: ['Chest'],
      equipment: 'Barbell',
      difficulty: 'Intermediate'
    };

    const mockExercise2: Exercise = {
      id: 'e2',
      name: 'Incline Dumbbell Press',
      primaryMuscles: ['Chest', 'Shoulders'],
      equipment: 'Dumbbell',
      difficulty: 'Intermediate'
    };

    return {
      id,
      name: 'Push Hypertrophy',
      description: 'Focus on chest, shoulders, and triceps for muscle growth.',
      estimatedDuration: 60,
      difficulty: 'Intermediate',
      tags: ['Push', 'Hypertrophy'],
      exercisesCount: 2,
      exercises: [
        {
          id: 'we1',
          exercise: mockExercise,
          targetSets: 3,
          targetReps: '8-10',
          restSeconds: 90,
        },
        {
          id: 'we2',
          exercise: mockExercise2,
          targetSets: 3,
          targetReps: '10-12',
          restSeconds: 90,
        }
      ]
    };
  }

  static async getExercises(): Promise<Exercise[]> {
    return [
      { id: 'e1', name: 'Barbell Bench Press', primaryMuscles: ['Chest'], equipment: 'Barbell', difficulty: 'Intermediate' },
      { id: 'e2', name: 'Incline Dumbbell Press', primaryMuscles: ['Chest'], equipment: 'Dumbbell', difficulty: 'Intermediate' },
      { id: 'e3', name: 'Pull-up', primaryMuscles: ['Back'], equipment: 'Bodyweight', difficulty: 'Intermediate' },
      { id: 'e4', name: 'Barbell Squat', primaryMuscles: ['Legs'], equipment: 'Barbell', difficulty: 'Advanced' },
      { id: 'e5', name: 'Dumbbell Lateral Raise', primaryMuscles: ['Shoulders'], equipment: 'Dumbbell', difficulty: 'Beginner' },
    ];
  }
}
