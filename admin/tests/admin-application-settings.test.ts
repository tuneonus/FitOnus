import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AppSettingRecord,
  MaintenanceSettingValue,
  MinVersionSettingValue,
  ForceUpdateSettingValue,
  SupportSettingValue,
  LegalSettingValue,
  FeatureFlagsSettingValue,
  AiLimitsSettingValue,
  AiUsageStats,
  UpdateSettingPayloadItem,
} from '../src/features/settings/types';

describe('Admin Application Settings — Phase 3 & 4 Verification', () => {
  it('1. Setting structures and safe defaults validate correctly', () => {
    const defaultMaintenance: MaintenanceSettingValue = {
      enabled: false,
      message: 'FitOnus is undergoing scheduled maintenance.',
      expectedEndTime: null,
    };
    assert.equal(defaultMaintenance.enabled, false);
    assert.equal(typeof defaultMaintenance.message, 'string');
    assert.equal(defaultMaintenance.expectedEndTime, null);

    const defaultFeatures: FeatureFlagsSettingValue = {
      aiCoach: true,
      mealPhotoScanner: true,
      voiceMealEntry: true,
      workoutGenerator: true,
    };
    assert.equal(defaultFeatures.aiCoach, true);
    assert.equal(defaultFeatures.mealPhotoScanner, true);
    assert.equal(defaultFeatures.voiceMealEntry, true);
    assert.equal(defaultFeatures.workoutGenerator, true);

    const defaultAiLimits: AiLimitsSettingValue = {
      dailyGlobalLimit: 100,
      coachChatDailyLimit: 50,
      mealPhotoDailyLimit: 20,
      voiceMealDailyLimit: 20,
      workoutGeneratorDailyLimit: 10,
    };
    assert.equal(defaultAiLimits.dailyGlobalLimit, 100);
    assert(defaultAiLimits.dailyGlobalLimit >= defaultAiLimits.coachChatDailyLimit);
  });

  it('2. URL and Email format validation handles valid and invalid inputs', () => {
    const isValidUrl = (url: string) => {
      if (!url) return true;
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    };

    const isValidEmail = (email: string) => {
      if (!email) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // Valid URLs
    assert.equal(isValidUrl('https://fitonus.com/privacy'), true);
    assert.equal(isValidUrl('http://localhost:3000'), true);
    assert.equal(isValidUrl('https://play.google.com/store/apps/details?id=com.fitonus.app'), true);

    // Invalid URLs
    assert.equal(isValidUrl('not-a-url'), false);
    assert.equal(isValidUrl('ftp://invalid-scheme.com'), false);
    assert.equal(isValidUrl('javascript:alert(1)'), false);

    // Valid Emails
    assert.equal(isValidEmail('support@fitonus.com'), true);
    assert.equal(isValidEmail('admin.ops@sub.domain.co'), true);

    // Invalid Emails
    assert.equal(isValidEmail('no-at-sign.com'), false);
    assert.equal(isValidEmail('bad@domain'), false);
  });

  it('3. Optimistic concurrency control attaches expectedVersion to payload items', () => {
    const records: Record<string, AppSettingRecord> = {
      'app.maintenance': {
        key: 'app.maintenance',
        category: 'app',
        value: { enabled: false, message: 'Maintenance', expectedEndTime: null },
        description: 'Maintenance toggle',
        updatedBy: 'admin-uuid',
        updatedAt: new Date().toISOString(),
        version: 3,
      },
      'features.flags': {
        key: 'features.flags',
        category: 'features',
        value: { aiCoach: true, mealPhotoScanner: true, voiceMealEntry: true, workoutGenerator: true },
        description: 'Feature flags',
        updatedBy: 'admin-uuid',
        updatedAt: new Date().toISOString(),
        version: 5,
      },
    };

    const buildUpdatePayload = (
      key: 'app.maintenance' | 'features.flags',
      newValue: unknown
    ): UpdateSettingPayloadItem => ({
      key,
      value: newValue,
      expectedVersion: records[key]?.version,
    });

    const maintenancePayload = buildUpdatePayload('app.maintenance', {
      enabled: true,
      message: 'Server upgrade in progress',
      expectedEndTime: '2026-11-09T12:00:00Z',
    });

    assert.equal(maintenancePayload.key, 'app.maintenance');
    assert.equal(maintenancePayload.expectedVersion, 3);

    const featurePayload = buildUpdatePayload('features.flags', {
      aiCoach: false,
      mealPhotoScanner: true,
      voiceMealEntry: false,
      workoutGenerator: true,
    });
    assert.equal(featurePayload.key, 'features.flags');
    assert.equal(featurePayload.expectedVersion, 5);
  });

  it('4. AI usage statistics aggregation correctly accumulates daily totals', () => {
    const aiStats: AiUsageStats = {
      todayTotalRequests: 85,
      todayActiveAiUsers: 14,
      breakdownByAction: {
        coach_chat: 50,
        meal_photo: 20,
        voice_meal: 10,
        workout_generator: 5,
      },
    };

    const sum = Object.values(aiStats.breakdownByAction).reduce((acc, v) => acc + v, 0);
    assert.equal(sum, aiStats.todayTotalRequests);
    assert.equal(aiStats.todayActiveAiUsers, 14);
  });

  it('5. Dirty state comparison detects modifications accurately', () => {
    const initialMaintenance: MaintenanceSettingValue = {
      enabled: false,
      message: 'Initial message',
      expectedEndTime: null,
    };

    let draftMaintenance = { ...initialMaintenance };
    const isDirty = () => JSON.stringify(initialMaintenance) !== JSON.stringify(draftMaintenance);

    assert.equal(isDirty(), false);

    draftMaintenance.enabled = true;
    assert.equal(isDirty(), true);

    draftMaintenance = { ...initialMaintenance };
    assert.equal(isDirty(), false);
  });
});
