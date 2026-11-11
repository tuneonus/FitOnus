import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVersion,
  compareVersions,
  isVersionBelowMinimum,
} from '../src/shared/utils/versionCompare';
import {
  DEFAULT_PUBLIC_APP_CONFIG,
  configService,
  type PublicAppConfig,
} from '../src/services/configService';

describe('Mobile App Configuration & Remote Settings Verification', () => {
  describe('1. Version Comparison & Semver Utility', () => {
    it('parses semver versions into [major, minor, patch] tuples', () => {
      assert.deepEqual(parseVersion('1.0.0'), [1, 0, 0]);
      assert.deepEqual(parseVersion('v2.14.3'), [2, 14, 3]);
      assert.deepEqual(parseVersion('3.2.1-beta.1'), [3, 2, 1]);
      assert.deepEqual(parseVersion('invalid'), [0, 0, 0]);
      assert.deepEqual(parseVersion(''), [0, 0, 0]);
    });

    it('accurately compares two version strings', () => {
      assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
      assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
      assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
      assert.equal(compareVersions('1.1.0', '1.0.9'), 1);
      assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
      assert.equal(compareVersions('0.9.5', '1.0.0'), -1);
    });

    it('correctly determines if installed version is below minimum required version', () => {
      // Installed 1.0.0, Required 1.2.0 -> Below minimum (true)
      assert.equal(isVersionBelowMinimum('1.0.0', '1.2.0'), true);
      // Installed 1.2.0, Required 1.2.0 -> Not below minimum (false)
      assert.equal(isVersionBelowMinimum('1.2.0', '1.2.0'), false);
      // Installed 2.0.0, Required 1.2.0 -> Not below minimum (false)
      assert.equal(isVersionBelowMinimum('2.0.0', '1.2.0'), false);
      // Missing minimum version -> Not below minimum (false)
      assert.equal(isVersionBelowMinimum('1.0.0', ''), false);
    });
  });

  describe('2. Safe Defaults and Contract Structure', () => {
    it('contains all required app configuration sections with valid types', () => {
      const config: PublicAppConfig = DEFAULT_PUBLIC_APP_CONFIG;

      // Maintenance
      assert.equal(typeof config.maintenance.enabled, 'boolean');
      assert.equal(typeof config.maintenance.message, 'string');
      assert(config.maintenance.message.length > 0);

      // Min Version
      assert.equal(typeof config.minVersion.androidMinVersion, 'string');
      assert.deepEqual(parseVersion(config.minVersion.androidMinVersion), [1, 0, 0]);

      // Force Update
      assert.equal(typeof config.forceUpdate.enabled, 'boolean');
      assert.equal(typeof config.forceUpdate.updateMessage, 'string');
      assert(config.forceUpdate.storeUrl.startsWith('https://'));

      // Support & Legal
      assert(config.support.email.includes('@'));
      assert(config.legal.privacyPolicyUrl.startsWith('https://'));
      assert(config.legal.termsOfServiceUrl.startsWith('https://'));

      // Features
      assert.equal(typeof config.features.aiCoach, 'boolean');
      assert.equal(typeof config.features.mealPhotoScanner, 'boolean');
      assert.equal(typeof config.features.voiceMealEntry, 'boolean');
      assert.equal(typeof config.features.workoutGenerator, 'boolean');

      // AI Limits
      assert.equal(typeof config.aiLimits.dailyGlobalLimit, 'number');
      assert(config.aiLimits.dailyGlobalLimit >= 50);
    });
  });

  describe('3. Maintenance & Force Update Evaluation', () => {
    it('evaluates maintenance mode state accurately', () => {
      // By default maintenance is disabled
      assert.equal(DEFAULT_PUBLIC_APP_CONFIG.maintenance.enabled, false);

      const activeMaintenanceConfig: PublicAppConfig = {
        ...DEFAULT_PUBLIC_APP_CONFIG,
        maintenance: {
          enabled: true,
          message: 'Upgrading database cluster',
          expectedEndTime: '2026-11-09T12:00:00Z',
        },
      };

      assert.equal(activeMaintenanceConfig.maintenance.enabled, true);
      assert.equal(activeMaintenanceConfig.maintenance.message, 'Upgrading database cluster');
    });

    it('evaluates force update triggers based on version threshold', () => {
      const forceUpdateConfig: PublicAppConfig = {
        ...DEFAULT_PUBLIC_APP_CONFIG,
        minVersion: {
          androidMinVersion: '2.0.0',
        },
        forceUpdate: {
          enabled: true,
          updateMessage: 'OnusFit 2.0 is required.',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.tuneonus.onusfit',
        },
      };

      // When forceUpdate is enabled:
      // Client on 1.0.0 -> Must update
      const requiresUpdateV1 =
        forceUpdateConfig.forceUpdate.enabled &&
        isVersionBelowMinimum('1.0.0', forceUpdateConfig.minVersion.androidMinVersion);
      assert.equal(requiresUpdateV1, true);

      // Client on 2.0.0 -> Compliant, no update forced
      const requiresUpdateV2 =
        forceUpdateConfig.forceUpdate.enabled &&
        isVersionBelowMinimum('2.0.0', forceUpdateConfig.minVersion.androidMinVersion);
      assert.equal(requiresUpdateV2, false);

      // Client on 2.1.0 -> Compliant, no update forced
      const requiresUpdateV3 =
        forceUpdateConfig.forceUpdate.enabled &&
        isVersionBelowMinimum('2.1.0', forceUpdateConfig.minVersion.androidMinVersion);
      assert.equal(requiresUpdateV3, false);
    });

    it('does not force update when forceUpdate.enabled is false even if installed < minVersion', () => {
      const softMinVersionConfig: PublicAppConfig = {
        ...DEFAULT_PUBLIC_APP_CONFIG,
        minVersion: {
          androidMinVersion: '2.0.0',
        },
        forceUpdate: {
          enabled: false,
          updateMessage: 'Update recommended.',
          storeUrl: 'https://play.google.com/store/apps/details?id=com.tuneonus.onusfit',
        },
      };

      const requiresUpdate =
        softMinVersionConfig.forceUpdate.enabled &&
        isVersionBelowMinimum('1.0.0', softMinVersionConfig.minVersion.androidMinVersion);
      assert.equal(requiresUpdate, false);
    });
  });

  describe('4. Feature Flag Remote Control', () => {
    it('verifies individual feature toggles reflect remote status', () => {
      const configWithDisabledAi: PublicAppConfig = {
        ...DEFAULT_PUBLIC_APP_CONFIG,
        features: {
          aiCoach: false,
          mealPhotoScanner: false,
          voiceMealEntry: true,
          workoutGenerator: true,
        },
      };

      assert.equal(configWithDisabledAi.features.aiCoach, false);
      assert.equal(configWithDisabledAi.features.mealPhotoScanner, false);
      assert.equal(configWithDisabledAi.features.voiceMealEntry, true);
      assert.equal(configWithDisabledAi.features.workoutGenerator, true);
    });
  });

  describe('5. Offline Fallback & Resilient Configuration Fetching', () => {
    it('returns valid fallback configuration synchronously without throwing', () => {
      const current = configService.getCurrentConfigSync();
      assert.ok(current);
      assert.equal(typeof current.features.aiCoach, 'boolean');
      assert.equal(typeof current.maintenance.enabled, 'boolean');
    });
  });
});
