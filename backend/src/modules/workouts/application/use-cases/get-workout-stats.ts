import type { IExerciseRepository, IWorkoutPlanRepository, IWorkoutSessionRepository } from '../ports.js';

export interface WorkoutStatsView {
  totalExercises: number;
  totalSystemTemplates: number;
  totalTemplates: number;
  totalCompletedSessions: number;
  totalSessions: number;
  totalVolumeLiftedKg: number;
  totalVolumeKg: number;
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
      totalTemplates: totalSystemTemplates,
      totalCompletedSessions,
      totalSessions: totalCompletedSessions,
      totalVolumeLiftedKg,
      totalVolumeKg: totalVolumeLiftedKg,
      activeLiftersCount,
    };
  }
}
