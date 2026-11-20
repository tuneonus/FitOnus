import { AppError } from '../../../../shared/errors/app-error.js';
import { WATER_LIMITS } from '../../domain/nutrition-limits.js';
import type { INutritionSettingsRepository, IUserProfileTargetPort } from '../ports.js';

export interface SetWaterTargetInput {
  userId: string;
  /** The member's own daily target in ml, or null to clear it so the estimate from their weight applies again. */
  targetMl: number | null;
}

export interface WaterTargetView {
  /** The target now in effect (the member's own, else the estimate), or null when there is nothing to base one on. */
  targetMl: number | null;
  source: 'saved' | 'estimated' | null;
}

/**
 * Saves or clears the member's daily water target. Idempotent: the same call twice leaves the same state. The reply
 * is the target now in effect, so a client never has to guess what clearing falls back to.
 */
export class SetWaterTargetUseCase {
  constructor(
    private readonly settingsRepo: INutritionSettingsRepository,
    private readonly targetPort: IUserProfileTargetPort,
  ) {}

  async execute(input: SetWaterTargetInput): Promise<WaterTargetView> {
    const { targetMl } = input;
    if (targetMl !== null) {
      const { min, max } = WATER_LIMITS.targetMl;
      if (!Number.isInteger(targetMl) || targetMl < min || targetMl > max) {
        throw new AppError('validation', 'VALIDATION_FAILED', `Water target must be a whole number between ${min} and ${max} ml`);
      }
    }
    await this.settingsRepo.saveWaterTarget(input.userId, targetMl);
    const targets = await this.targetPort.findTargetsByUserId(input.userId);
    return { targetMl: targets.waterMl, source: targets.waterSource };
  }
}
