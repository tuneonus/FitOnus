import { AppError } from '../../../../shared/errors/app-error.js';
import type { AiLimitsSettingValue, AiUsageActionType, FeatureFlagsSettingValue } from '../../domain/app-setting.js';
import type { AppSettingsRepository } from '../ports.js';

export interface CheckAiQuotaInput {
  userId: string;
  actionType: AiUsageActionType;
}

export interface CheckAiQuotaResult {
  currentUsage: number;
  limit: number;
  remaining: number;
}

export class CheckAndRecordAiQuotaUseCase {
  constructor(private readonly repo: AppSettingsRepository) {}

  async execute(input: CheckAiQuotaInput): Promise<CheckAiQuotaResult> {
    const [featuresSetting, limitsSetting] = await Promise.all([
      this.repo.getSettingByKey('features.flags'),
      this.repo.getSettingByKey('ai.limits'),
    ]);

    const flags = (featuresSetting?.value ?? {
      aiCoach: true,
      mealPhotoScanner: true,
      voiceMealEntry: true,
      workoutGenerator: true,
    }) as FeatureFlagsSettingValue;

    const limits = (limitsSetting?.value ?? {
      dailyGlobalLimit: 50,
      coachChatDailyLimit: 20,
      mealPhotoDailyLimit: 10,
      voiceMealDailyLimit: 10,
      workoutGeneratorDailyLimit: 10,
    }) as AiLimitsSettingValue;

    // 1. Enforce feature flag availability
    if (input.actionType === 'coach_chat' && !flags.aiCoach) {
      throw new AppError('unprocessable', 'FEATURE_DISABLED', 'The AI Coach is currently disabled by system administrators.');
    }
    if (input.actionType === 'meal_photo' && !flags.mealPhotoScanner) {
      throw new AppError('unprocessable', 'FEATURE_DISABLED', 'AI Meal Photo Scanner is currently disabled by system administrators.');
    }
    if (input.actionType === 'voice_meal' && !flags.voiceMealEntry) {
      throw new AppError('unprocessable', 'FEATURE_DISABLED', 'Voice Meal Entry is currently disabled by system administrators.');
    }
    if (input.actionType === 'workout_generator' && !flags.workoutGenerator) {
      throw new AppError('unprocessable', 'FEATURE_DISABLED', 'AI Workout Generator is currently disabled by system administrators.');
    }

    // 2. Determine per-action quota limit
    let actionLimit = limits.coachChatDailyLimit;
    if (input.actionType === 'meal_photo') actionLimit = limits.mealPhotoDailyLimit;
    if (input.actionType === 'voice_meal') actionLimit = limits.voiceMealDailyLimit;
    if (input.actionType === 'workout_generator') actionLimit = limits.workoutGeneratorDailyLimit;

    // 3. Check current usage
    const currentUsage = await this.repo.getUserTodayAiUsage(input.userId, input.actionType);
    if (currentUsage >= actionLimit) {
      throw new AppError(
        'rate_limited',
        'RATE_LIMITED',
        `Daily limit for this AI feature (${actionLimit} requests) has been reached. Quota resets at 00:00 UTC.`,
      );
    }

    // 4. Atomically record usage
    const newCount = await this.repo.incrementUserAiUsage(input.userId, input.actionType);

    return {
      currentUsage: newCount,
      limit: actionLimit,
      remaining: Math.max(0, actionLimit - newCount),
    };
  }
}
