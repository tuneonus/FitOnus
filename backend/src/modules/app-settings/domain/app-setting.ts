export interface MaintenanceSettingValue {
  enabled: boolean;
  message: string;
  expectedEndTime: string | null;
}

export interface MinVersionSettingValue {
  androidMinVersion: string;
}

export interface ForceUpdateSettingValue {
  enabled: boolean;
  updateMessage: string;
  storeUrl: string;
}

export interface SupportSettingValue {
  email: string;
  website: string;
  contactInfo: string;
}

export interface LegalSettingValue {
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
}

export interface FeatureFlagsSettingValue {
  aiCoach: boolean;
  mealPhotoScanner: boolean;
  voiceMealEntry: boolean;
  workoutGenerator: boolean;
}

export interface AiLimitsSettingValue {
  dailyGlobalLimit: number;
  coachChatDailyLimit: number;
  mealPhotoDailyLimit: number;
  voiceMealDailyLimit: number;
  workoutGeneratorDailyLimit: number;
}

export type AppSettingKey =
  | 'app.maintenance'
  | 'app.min_version'
  | 'app.force_update'
  | 'app.support'
  | 'app.legal'
  | 'features.flags'
  | 'ai.limits';

export interface AppSettingValueMap {
  'app.maintenance': MaintenanceSettingValue;
  'app.min_version': MinVersionSettingValue;
  'app.force_update': ForceUpdateSettingValue;
  'app.support': SupportSettingValue;
  'app.legal': LegalSettingValue;
  'features.flags': FeatureFlagsSettingValue;
  'ai.limits': AiLimitsSettingValue;
}

export interface AppSettingRecord<K extends AppSettingKey = AppSettingKey> {
  key: K;
  category: string;
  value: AppSettingValueMap[K];
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
  version: number;
}

export interface PublicAppConfig {
  maintenance: MaintenanceSettingValue;
  minVersion: MinVersionSettingValue;
  forceUpdate: ForceUpdateSettingValue;
  support: SupportSettingValue;
  legal: LegalSettingValue;
  features: FeatureFlagsSettingValue;
  aiLimits: AiLimitsSettingValue;
}

export type AiUsageActionType = 'coach_chat' | 'meal_photo' | 'voice_meal' | 'workout_generator';

export interface AiUsageStats {
  todayTotalRequests: number;
  todayActiveAiUsers: number;
  breakdownByAction: Record<AiUsageActionType, number>;
}
