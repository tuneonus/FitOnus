import type { Actor } from '../../../../shared/auth/actor.js';
import { AppError } from '../../../../shared/errors/app-error.js';
import { MetabolicCalculator } from '../../domain/metabolic-calculator.js';
import type { ProfileRepository } from '../ports.js';
import type { OnboardingCompleteView } from '../profile-view.js';

export class CompleteOnboardingUseCase {
  constructor(private readonly deps: { profileRepo: ProfileRepository }) {}

  async execute(actor: Actor): Promise<OnboardingCompleteView> {
    const data = await this.deps.profileRepo.ensureProfile(actor.userId);
    const { profile } = data;

    // Idempotent completion check
    if (profile.onboardingCompleted && profile.dailyCalorieTarget && profile.dailyProteinGrams) {
      return {
        onboardingCompleted: true,
        calculatedPlan: {
          dailyCalorieTarget: profile.dailyCalorieTarget,
          dailyProteinGrams: profile.dailyProteinGrams,
          workoutsPerWeek: profile.workoutDaysPerWeek ?? 4,
          projectedMilestone: this.generateProjectedMilestone(
            profile.primaryGoal ?? 'maintain',
            profile.targetWeightKg ? Number(profile.targetWeightKg) : null,
          ),
        },
      };
    }

    // Required fields check
    if (!profile.isReadyForOnboardingCompletion()) {
      const missing: string[] = [];
      if (profile.heightCm === null) missing.push('height');
      if (profile.currentWeightKg === null) missing.push('weight');
      if (profile.primaryGoal === null) missing.push('primaryGoal');

      throw new AppError(
        'validation',
        'VALIDATION_FAILED',
        `Cannot complete onboarding: required fields missing (${missing.join(', ')}).`,
        { missing },
      );
    }

    const age = profile.age ?? 25;
    const weightKg = Number(profile.currentWeightKg);
    const heightCm = Number(profile.heightCm);

    const metrics = MetabolicCalculator.calculateTargets({
      weightKg,
      heightCm,
      age,
      sex: profile.sex,
      goal: profile.primaryGoal!,
      workoutDaysPerWeek: profile.workoutDaysPerWeek,
    });

    await this.deps.profileRepo.completeOnboarding(actor.userId, {
      dailyCalorieTarget: metrics.dailyCalorieTarget,
      dailyProteinGrams: metrics.dailyProteinGrams,
    });

    return {
      onboardingCompleted: true,
      calculatedPlan: {
        dailyCalorieTarget: metrics.dailyCalorieTarget,
        dailyProteinGrams: metrics.dailyProteinGrams,
        workoutsPerWeek: profile.workoutDaysPerWeek ?? 4,
        projectedMilestone: this.generateProjectedMilestone(
          profile.primaryGoal!,
          profile.targetWeightKg ? Number(profile.targetWeightKg) : null,
        ),
      },
    };
  }

  private generateProjectedMilestone(goal: string, targetWeightKg: number | null): string {
    if (goal === 'lose' && targetWeightKg) {
      return `Projected to reach ${targetWeightKg} kg with steady adherence (~0.4 kg/week).`;
    }
    if (goal === 'gain' && targetWeightKg) {
      return `Projected to reach ${targetWeightKg} kg with progressive overload (~0.25 kg/week).`;
    }
    if (goal === '5k') {
      return 'Projected to build to a continuous 5K run within 6 to 8 weeks.';
    }
    if (goal === '10k') {
      return 'Projected to complete a 10K run within 10 to 12 weeks.';
    }
    if (goal === 'marathon') {
      return 'Structured 16-to-20 week build program initialized.';
    }
    return 'Metabolic targets calibrated. Ready to start training.';
  }
}
