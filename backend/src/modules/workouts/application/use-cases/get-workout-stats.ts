import type { IExerciseRepository, IWorkoutPlanRepository, IWorkoutSessionRepository } from '../ports.js';

export interface WorkoutStatsView {
  totalExercises: number;
  totalSystemTemplates: number;
  totalCompletedSessions: number;
  totalVolumeLiftedKg: number;
  activeLiftersCount: number;
}

export class GetWorkoutStatsUseCase {
  constructor(
    private readonly exerciseRepo: IExerciseRepository,
    private readonly workoutRepo: IWorkoutPlanRepository,
    private readonly sessionRepo: IWorkoutSessionRepository,
  ) {}

  async execute(): Promise<WorkoutStatsView> {
    const [
      totalExercises,
      totalSystemTemplates,
      totalCompletedSessions,
      totalVolumeLiftedKg,
      activeLiftersCount,
    ] = await Promise.all([
      this.exerciseRepo.countAll(),
      this.workoutRepo.countSystemTemplates(),
      this.sessionRepo.countCompletedSessions(),
      this.sessionRepo.getTotalVolumeLifted(),
      this.sessionRepo.getDistinctLiftersCount(),
    ]);

    return {
      totalExercises,
      totalSystemTemplates,
      totalCompletedSessions,
      totalVolumeLiftedKg,
      activeLiftersCount,
    };
  }
}
