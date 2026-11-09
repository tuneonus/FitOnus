import { createPool } from '../src/database/pool.js';
import { loadConfig } from '../src/config/env.js';
import { PgAppSettingsRepository } from '../src/modules/app-settings/infrastructure/pg-app-settings-repository.js';
import { UpdateAppSettingsUseCase } from '../src/modules/app-settings/application/use-cases/update-app-settings.js';
import { GetPublicAppConfigUseCase } from '../src/modules/app-settings/application/use-cases/get-public-app-config.js';
import { CheckAndRecordAiQuotaUseCase } from '../src/modules/app-settings/application/use-cases/check-and-record-ai-quota.js';
import { createActor, type Actor } from '../src/shared/auth/actor.js';
import type { AdminAuditLoggerPort } from '../src/modules/app-settings/application/ports.js';

async function main() {
  console.log('--- STARTING NEON DEV LIVE APPLICATION SETTINGS VERIFICATION ---');
  const config = loadConfig();
  console.log('Database target:', config.database.url.split('@')[1] || 'DEV DB');

  if (!config.database.url.includes('neon.tech') && !config.database.url.includes('localhost') && !config.database.url.includes('127.0.0.1')) {
    throw new Error('Safety assertion failed: Database URL does not match DEV environment');
  }

  const pool = createPool(config.database);
  const auditLogs: any[] = [];
  const fakeAuditLogger: AdminAuditLoggerPort = {
    async recordAuditLog(input) {
      auditLogs.push(input as any);
    },
  };

  try {
    const repo = new PgAppSettingsRepository(pool);
    const updateUseCase = new UpdateAppSettingsUseCase({
      repo,
      auditLogger: fakeAuditLogger,
    });
    const publicConfigUseCase = new GetPublicAppConfigUseCase(repo);
    const quotaUseCase = new CheckAndRecordAiQuotaUseCase(repo);

    // 1. Verify all settings exist
    console.log('\n1. Fetching all existing application settings from Neon DEV...');
    const allSettings = await repo.getAllSettings();
    console.log(`Found ${allSettings.length} setting records:`);
    for (const s of allSettings) {
      console.log(` - [${s.category}] ${s.key} (v${s.version}):`, JSON.stringify(s.value));
    }

    if (allSettings.length < 7) {
      throw new Error(`Expected at least 7 settings seeded in migration 0014, found ${allSettings.length}`);
    }

    // 2. Test Public Configuration Projection
    console.log('\n2. Testing Public Configuration Projection...');
    const publicConfig = await publicConfigUseCase.execute();
    console.log('Public Config retrieved:');
    console.log(' - Maintenance:', publicConfig.maintenance);
    console.log(' - Min Version:', publicConfig.minVersion);
    console.log(' - Force Update:', publicConfig.forceUpdate);
    console.log(' - Features:', publicConfig.features);
    console.log(' - AI Limits:', publicConfig.aiLimits);

    // 3. Test Optimistic Concurrency & Persistence
    console.log('\n3. Testing Update with Optimistic Locking...');
    const initialSupport = await repo.getSettingByKey('app.support');
    if (!initialSupport) throw new Error('app.support setting not found');

    const userRes = await pool.query<{ id: string }>('SELECT id FROM users LIMIT 1');
    const existingUserId = userRes.rows[0]?.id;
    if (!existingUserId) throw new Error('No user found in Neon DEV to test audit actor');

    const adminActor: Actor = createActor({
      userId: existingUserId,
      sessionId: 'sess-test-app-settings',
      role: 'admin',
    });

    const originalSupportValue = initialSupport.value;
    const originalVersion = initialSupport.version;

    console.log(`Original app.support version: ${originalVersion}`);

    // Update with correct version
    const updated = await updateUseCase.execute(
      adminActor,
      {
        settings: [
          {
            key: 'app.support',
            value: {
              email: 'verified-dev@fitonus.com',
              website: 'https://dev.fitonus.com/support',
              contactInfo: '+1 (800) FIT-DEV1',
            },
            expectedVersion: originalVersion,
          },
        ],
      },
      { ip: '127.0.0.1', userAgent: 'Verification-Script/1.0' }
    );

    console.log(`Updated app.support in Neon DEV. New version: ${updated[0]!.version}`);
    if (updated[0]!.version !== originalVersion + 1) {
      throw new Error(`Expected version ${originalVersion + 1}, got ${updated[0]!.version}`);
    }

    // Attempt update with stale version (must fail with VERSION_CONFLICT)
    console.log('\n4. Testing Stale Version Conflict Rejection...');
    let conflictCaught = false;
    try {
      await updateUseCase.execute(
        adminActor,
        {
          settings: [
            {
              key: 'app.support',
              value: {
                email: 'stale@fitonus.com',
                website: 'https://fitonus.com',
                contactInfo: '123',
              },
              expectedVersion: originalVersion, // Stale!
            },
          ],
        },
        { ip: '127.0.0.1', userAgent: 'Verification-Script/1.0' }
      );
    } catch (err: any) {
      if (err.code === 'VERSION_CONFLICT') {
        conflictCaught = true;
        console.log('✓ Successfully caught expected VERSION_CONFLICT error');
      } else {
        throw err;
      }
    }

    if (!conflictCaught) {
      throw new Error('Failed: Stale version did not throw VERSION_CONFLICT');
    }

    // 5. Restore original value
    console.log('\n5. Restoring original app.support values in Neon DEV...');
    const restored = await updateUseCase.execute(
      adminActor,
      {
        settings: [
          {
            key: 'app.support',
            value: originalSupportValue,
            expectedVersion: updated[0]!.version,
          },
        ],
      },
      { ip: '127.0.0.1', userAgent: 'Verification-Script/1.0' }
    );
    console.log(`Restored app.support to original content. Current version: ${restored[0]!.version}`);

    // 6. Test Atomic AI Quota Enforcement
    console.log('\n6. Testing Atomic Daily AI Quota tracking on Neon DEV...');
    const testUserId = existingUserId;
    const initialUsage = await repo.getUserTodayAiUsage(testUserId, 'coach_chat');
    console.log('Current coach_chat usage for test user:', initialUsage);

    const quotaResult1 = await quotaUseCase.execute({
      userId: testUserId,
      actionType: 'coach_chat',
    });
    console.log('First AI operation result:', quotaResult1);

    const quotaResult2 = await quotaUseCase.execute({
      userId: testUserId,
      actionType: 'coach_chat',
    });
    console.log('Second AI operation result:', quotaResult2);

    if (quotaResult2.currentUsage !== quotaResult1.currentUsage + 1) {
      throw new Error('AI usage count did not increment atomically');
    }

    // Clean up or restore test usage row
    if (initialUsage === 0) {
      await pool.query('DELETE FROM user_ai_usage WHERE user_id = $1 AND action_type = $2', [testUserId, 'coach_chat']);
    } else {
      await pool.query('UPDATE user_ai_usage SET count = $1 WHERE user_id = $2 AND action_type = $3', [initialUsage, testUserId, 'coach_chat']);
    }
    console.log('✓ Restored test user AI usage records');

    console.log('\n=== ALL NEON DEV DATABASE CHECKS PASSED WITH 100% SUCCESS ===\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
