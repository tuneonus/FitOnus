import { AppError } from '../../../../shared/errors/app-error.js';
import type {
  AiLimitsSettingValue,
  AiUsageActionType,
  FeatureFlagsSettingValue,
} from '../../domain/app-setting.js';
import type { AppSettingsRepository } from '../ports.js';

export interface CheckAiQuotaInput {
  userId: string;
  actionType: AiUsageActionType;
}

export interface CheckAiQuotaResult {
  userId: string;
  actionType: AiUsageActionType;
  /** UTC day the unit was charged to; pass it back to `release` so a refund hits the same day. */
  usageDate: string;
  /** Units used for this action today, including the one just reserved. */
  currentUsage: number;
  limit: number;
  remaining: number;
  /** Units used across all AI actions today, including the one just reserved. */
  totalUsage: number;
  totalLimit: number;
}

/** Applied when a setting row is missing, so a missing row can never mean "unlimited". */
export const DEFAULT_FEATURE_FLAGS: FeatureFlagsSettingValue = {
  aiCoach: true,
  mealPhotoScanner: true,
  voiceMealEntry: true,
  workoutGenerator: true,
};

export const DEFAULT_AI_LIMITS: AiLimitsSettingValue = {
  dailyGlobalLimit: 50,
  coachChatDailyLimit: 20,
  mealPhotoDailyLimit: 10,
  voiceMealDailyLimit: 10,
  workoutGeneratorDailyLimit: 10,
};

const FLAG_BY_ACTION: Readonly<Record<AiUsageActionType, keyof FeatureFlagsSettingValue>> = {
  coach_chat: 'aiCoach',
  meal_photo: 'mealPhotoScanner',
  voice_meal: 'voiceMealEntry',
  workout_generator: 'workoutGenerator',
};

const LIMIT_BY_ACTION: Readonly<Record<AiUsageActionType, keyof AiLimitsSettingValue>> = {
  coach_chat: 'coachChatDailyLimit',
  meal_photo: 'mealPhotoDailyLimit',
  voice_meal: 'voiceMealDailyLimit',
  workout_generator: 'workoutGeneratorDailyLimit',
};

const DISABLED_MESSAGE: Readonly<Record<AiUsageActionType, string>> = {
  coach_chat: 'The AI Coach is currently disabled by system administrators.',
  meal_photo: 'AI Meal Photo Scanner is currently disabled by system administrators.',
  voice_meal: 'Voice Meal Entry is currently disabled by system administrators.',
  workout_generator: 'AI Workout Generator is currently disabled by system administrators.',
};

const DAY_MS = 86_400_000;

/** A stored limit that is not a non-negative integer falls back to the default, never to "unlimited". */
const limitOrDefault = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;

/**
 * Feature-flag and daily-quota policy for AI operations.
 *
 * - Settings are read from PostgreSQL on every call, so an administrator's change applies to the
 *   very next request (no process-local cache to go stale).
 * - `dailyGlobalLimit` is the cap on the TOTAL AI operations one user may perform per UTC day across
 *   all AI features ("Max total AI ops / user / day" in the admin panel). It is not a platform-wide cap.
 * - The limit check and the increment are one atomic repository operation (`reserveAiUsage`).
 */
export class CheckAndRecordAiQuotaUseCase {
  constructor(private readonly repo: AppSettingsRepository) {}

  /** Throws FEATURE_DISABLED when the feature is switched off. Reads settings only; charges nothing. */
  async assertEnabled(actionType: AiUsageActionType): Promise<void> {
    const setting = await this.repo.getSettingByKey('features.flags');
    this.assertFlagEnabled(setting?.value, actionType);
  }

  /** Enforces the feature flag, then atomically reserves one unit against both daily limits. */
  async execute(input: CheckAiQuotaInput): Promise<CheckAiQuotaResult> {
    const { userId, actionType } = input;
    const [featuresSetting, limitsSetting] = await Promise.all([
      this.repo.getSettingByKey('features.flags'),
      this.repo.getSettingByKey('ai.limits'),
    ]);

    this.assertFlagEnabled(featuresSetting?.value, actionType);

    const limits: AiLimitsSettingValue = { ...DEFAULT_AI_LIMITS, ...limitsSetting?.value };
    const actionLimit = limitOrDefault(
      limits[LIMIT_BY_ACTION[actionType]],
      DEFAULT_AI_LIMITS[LIMIT_BY_ACTION[actionType]],
    );
    const totalLimit = limitOrDefault(limits.dailyGlobalLimit, DEFAULT_AI_LIMITS.dailyGlobalLimit);

    const reserved = await this.repo.reserveAiUsage({ userId, actionType, actionLimit, totalLimit });

    if (!reserved.allowed) {
      const resetsAt = new Date(Date.parse(`${reserved.usageDate}T00:00:00Z`) + DAY_MS).toISOString();
      if (reserved.reason === 'action_limit') {
        throw new AppError(
          'rate_limited',
          'AI_QUOTA_EXCEEDED',
          `Daily limit for this AI feature (${actionLimit} requests) has been reached. Quota resets at 00:00 UTC.`,
          { scope: 'feature', action: actionType, limit: actionLimit, used: reserved.actionCount, resetsAt },
        );
      }
      throw new AppError(
        'rate_limited',
        'AI_QUOTA_EXCEEDED',
        `Daily limit for AI usage (${totalLimit} requests across all AI features) has been reached. Quota resets at 00:00 UTC.`,
        { scope: 'total', action: actionType, limit: totalLimit, used: reserved.totalCount, resetsAt },
      );
    }

    return {
      userId,
      actionType,
      usageDate: reserved.usageDate,
      currentUsage: reserved.actionCount,
      limit: actionLimit,
      remaining: Math.max(0, actionLimit - reserved.actionCount),
      totalUsage: reserved.totalCount,
      totalLimit,
    };
  }

  /** Refunds a reservation (used only when the request failed before reaching the provider). */
  async release(reservation: Pick<CheckAiQuotaResult, 'userId' | 'actionType' | 'usageDate'>): Promise<void> {
    await this.repo.releaseAiUsage({
      userId: reservation.userId,
      actionType: reservation.actionType,
      usageDate: reservation.usageDate,
    });
  }

  private assertFlagEnabled(
    stored: FeatureFlagsSettingValue | undefined,
    actionType: AiUsageActionType,
  ): void {
    const flags: FeatureFlagsSettingValue = { ...DEFAULT_FEATURE_FLAGS, ...stored };
    // Only an explicit `true` enables a feature: a corrupt stored value fails closed.
    if (flags[FLAG_BY_ACTION[actionType]] !== true) {
      throw new AppError('unprocessable', 'FEATURE_DISABLED', DISABLED_MESSAGE[actionType], {
        action: actionType,
      });
    }
  }
}
