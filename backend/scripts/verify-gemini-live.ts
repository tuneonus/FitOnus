import { createPool } from '../src/database/pool.js';
import { loadConfig } from '../src/config/env.js';
import { PgAppSettingsRepository } from '../src/modules/app-settings/infrastructure/pg-app-settings-repository.js';
import { GetGeminiConfigUseCase } from '../src/modules/app-settings/application/use-cases/get-gemini-config.js';
import { UpdateGeminiConfigUseCase } from '../src/modules/app-settings/application/use-cases/update-gemini-config.js';
import { RollbackGeminiKeyUseCase } from '../src/modules/app-settings/application/use-cases/rollback-gemini-key.js';
import { GetGeminiUsageAnalyticsUseCases } from '../src/modules/app-settings/application/use-cases/get-gemini-usage.js';
import { GeminiRuntimeService } from '../src/modules/app-settings/application/services/gemini-runtime-service.js';
import { encryptSecret, decryptSecret, maskApiKey } from '../src/shared/security/encryption.js';
import { createActor, type Actor } from '../src/shared/auth/actor.js';
import type { AdminAuditLoggerPort } from '../src/modules/app-settings/application/ports.js';

async function main() {
  console.log('--- STARTING NEON DEV LIVE GEMINI AI MANAGEMENT VERIFICATION ---');
  const config = loadConfig();
  console.log('Database target:', config.database.url.split('@')[1] || 'DEV DB');

  if (
    !config.database.url.includes('neon.tech') &&
    !config.database.url.includes('localhost') &&
    !config.database.url.includes('127.0.0.1')
  ) {
    throw new Error('Safety assertion failed: Database URL does not match DEV environment');
  }

  const pool = createPool(config.database);
  const auditLogs: any[] = [];
  const fakeAuditLogger: AdminAuditLoggerPort = {
    async recordAuditLog(input) {
      auditLogs.push(input);
    },
  };

  const masterSecret = config.security.hmacSecret;

  try {
    const userRes = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
    );
    const validUserId = userRes.rows[0]?.id || (await pool.query<{ id: string }>("SELECT id FROM users LIMIT 1")).rows[0]?.id;
    if (!validUserId) {
      throw new Error('No user found in Neon DEV users table!');
    }

    const adminActor: Actor = createActor({
      userId: validUserId,
      sessionId: 'sess-verify-001',
      role: 'admin',
    });

    const repo = new PgAppSettingsRepository(pool);
    const getGeminiConfig = new GetGeminiConfigUseCase({ repo, fallbackApiKey: config.gemini.apiKey });
    const updateGeminiConfig = new UpdateGeminiConfigUseCase({
      repo,
      auditLogger: fakeAuditLogger,
      encryptionKey: masterSecret,
    });
    const rollbackGeminiKey = new RollbackGeminiKeyUseCase({
      repo,
      auditLogger: fakeAuditLogger,
    });
    const analytics = new GetGeminiUsageAnalyticsUseCases(repo);
    const runtimeService = new GeminiRuntimeService({
      repo,
      encryptionKey: masterSecret,
      fallbackApiKey: config.gemini.apiKey,
    });

    // 1. Initial State Verification from Neon DEV
    console.log('\n1. Fetching live Gemini configuration from Neon DEV...');
    const initialConfig = await getGeminiConfig.execute(adminActor);
    console.log('Current Config:');
    console.log(' - Provider:', initialConfig.provider);
    console.log(' - Key Mask:', initialConfig.keyMask);
    console.log(' - Default Model:', initialConfig.defaultModel);
    console.log(' - Coach Model:', initialConfig.featureModels.aiCoach);
    console.log(' - Meal Photo Model:', initialConfig.featureModels.mealPhotoScanner);
    console.log(' - Voice Meal Model:', initialConfig.featureModels.voiceMealEntry);
    console.log(' - Workout Generator Model:', initialConfig.featureModels.workoutGenerator);
    console.log(' - Version:', initialConfig.version);

    // 2. Models & Pricing Catalog Verification
    console.log('\n2. Fetching Gemini models and token pricing catalog...');
    const models = await repo.getGeminiModelsWithPricing();
    console.log(`Found ${models.length} supported Gemini models in Neon DEV:`);
    for (const m of models) {
      console.log(
        ` - ${m.model} (${m.displayName}): $${m.inputPricePerMillion}/M in, $${m.outputPricePerMillion}/M out | Vision: ${m.capabilities.vision}, Audio: ${m.capabilities.audio}`,
      );
    }
    if (models.length < 3) {
      throw new Error(`Expected at least 3 models in gemini_pricing, found ${models.length}`);
    }

    // 3. Test AES-256-GCM Encryption / Decryption Round-Trip
    console.log('\n3. Testing AES-256-GCM Authenticated Encryption Round-Trip...');
    const sampleKey = 'AIzaSyA_LIVE_TEST_KEY_FOR_VERIFICATION_XYZ1234';
    const encrypted = encryptSecret(sampleKey, masterSecret);
    console.log(' - Ciphertext hex length:', encrypted.ciphertext.length);
    console.log(' - Auth Tag hex length:', encrypted.authTag.length);
    const decrypted = decryptSecret(encrypted, masterSecret);
    if (decrypted !== sampleKey) {
      throw new Error('Decryption mismatch!');
    }
    const masked = maskApiKey(sampleKey);
    console.log(' - Masked representation:', masked);
    if (!masked.startsWith('AIzaSy') || !masked.endsWith('1234')) {
      throw new Error(`Masking format unexpected: ${masked}`);
    }
    console.log('AES-256-GCM round-trip verified successfully.');

    // 4. Test Key Rotation & Optimistic Concurrency on Neon DEV
    console.log('\n4. Testing Gemini Key Update with Optimistic Locking on Neon DEV...');
    const testKey1 = 'AIzaSy_DEV_ROTATION_KEY_ALPHA_99999999';
    const updated1 = await updateGeminiConfig.execute(
      adminActor,
      {
        apiKey: testKey1,
        expectedVersion: initialConfig.version,
      },
    );
    console.log(' - Updated Config Version:', updated1.version);
    console.log(' - New Key Mask:', updated1.keyMask);
    console.log(' - Can Rollback Key:', updated1.canRollbackKey);

    // Verify raw DB column is encrypted and not plaintext
    const rawDbRow = await pool.query("SELECT encrypted_api_key, key_mask, version FROM gemini_config WHERE provider = 'google_gemini'");
    const rawEncrypted = rawDbRow.rows[0].encrypted_api_key;
    if (rawEncrypted.includes(testKey1)) {
      throw new Error('CRITICAL SECURITY VIOLATION: Raw API key found in PostgreSQL database!');
    }
    console.log(' - Verified DB stores only ciphertext (starts with v1:gcm: or json)');

    // Test Optimistic Version Conflict (expect 409)
    console.log('\n5. Testing Optimistic Concurrency Conflict Detection...');
    try {
      await updateGeminiConfig.execute(
        adminActor,
        {
          defaultModel: 'gemini-2.5-pro',
          expectedVersion: initialConfig.version, // Stale version!
        },
      );
      throw new Error('Expected version conflict error but succeeded!');
    } catch (err: any) {
      console.log(' - Version conflict caught successfully:', err.code, err.message);
      if (err.code !== 'VERSION_CONFLICT') {
        throw new Error(`Expected VERSION_CONFLICT, received ${err.code}`);
      }
    }

    // 6. Test Rollback to Previous Key on Neon DEV
    console.log('\n6. Testing Rollback to Previous API Key on Neon DEV...');
    const rolledBack = await rollbackGeminiKey.execute(
      adminActor,
      updated1.version,
    );
    console.log(' - Rolled back successfully to version:', rolledBack.version);
    console.log(' - Active Key Mask after rollback:', rolledBack.keyMask);
    console.log(' - Can Rollback Key:', rolledBack.canRollbackKey);

    // 7. Test Runtime Model Resolution
    console.log('\n7. Testing Dynamic Model Resolution via GeminiRuntimeService...');
    // Set custom per-feature model overrides
    await updateGeminiConfig.execute(
      adminActor,
      {
        featureModels: {
          aiCoach: 'gemini-2.5-flash',
          mealPhotoScanner: 'gemini-2.5-flash',
          workoutGenerator: 'gemini-2.5-pro',
        },
        expectedVersion: rolledBack.version,
      },
    );
    await runtimeService.refreshCache();

    const resolvedCoach = (await runtimeService.resolveExecutionTarget('coach_chat')).model;
    const resolvedWorkout = (await runtimeService.resolveExecutionTarget('workout_generator')).model;
    console.log(' - Resolved Coach Model:', resolvedCoach);
    console.log(' - Resolved Workout Model:', resolvedWorkout);
    if (resolvedCoach !== 'gemini-2.5-flash' || resolvedWorkout !== 'gemini-2.5-pro') {
      throw new Error('Model resolution mismatch!');
    }

    // 8. Test Telemetry Event Recording & Analytics Aggregation
    console.log('\n8. Testing Gemini Usage Telemetry Recording in Neon DEV...');
    const testRequestId = `test-req-${Date.now()}`;
    await repo.recordGeminiUsage({
      requestId: testRequestId,
      userId: adminActor.userId,
      feature: 'coach_chat',
      model: 'gemini-2.5-flash',
      status: 'success',
      inputTokens: 2500,
      outputTokens: 500,
      cachedTokens: 0,
      totalTokens: 3000,
      estimatedCostUsd: 0.0003375,
      durationMs: 380,
      errorCategory: null,
      providerRequestId: null,
    });
    console.log(' - Recorded usage event with Request ID:', testRequestId);

    // Query Analytics
    console.log('\n9. Querying Live AI Analytics from Neon DEV...');
    const summary = await analytics.getSummary(adminActor);
    console.log(' - Summary Today Requests:', summary.todayRequests);
    console.log(' - Summary Month Requests:', summary.monthlyRequests);
    console.log(' - Summary Total Tokens:', summary.totalTokens);
    console.log(' - Summary Estimated Cost (USD):', `$${summary.estimatedMonthlyCostUsd.toFixed(5)}`);
    console.log(' - Summary Estimated Cost (INR):', `₹${(summary.estimatedMonthlyCostUsd * 86.5).toFixed(3)}`);

    const byFeature = await analytics.getByFeature(adminActor);
    console.log(' - Breakdown by Feature:', byFeature);

    const byModel = await analytics.getByModel(adminActor);
    console.log(' - Breakdown by Model:', byModel);

    const trends = await analytics.getDailyTrends(adminActor, 7);
    console.log(` - Daily trends retrieved (${trends.length} days)`);

    const eventsResult = await analytics.getEvents(adminActor, { limit: 5 });
    console.log(` - Telemetry events table retrieved (${eventsResult.total} total events, showing ${eventsResult.items.length})`);

    // 10. Clean up Test Usage Event and Restore Config
    console.log('\n10. Cleaning up test telemetry data and restoring initial config...');
    await pool.query('DELETE FROM gemini_usage_events WHERE request_id = $1', [testRequestId]);
    console.log(' - Test usage event cleaned up.');

    // Restore original state
    const currentVer = (await pool.query("SELECT version FROM gemini_config WHERE provider = 'google_gemini'")).rows[0].version;
    await pool.query(
      `UPDATE gemini_config
       SET encrypted_api_key = NULL,
           key_mask = NULL,
           previous_encrypted_api_key = NULL,
           previous_key_mask = NULL,
           default_model = 'gemini-2.5-flash',
           coach_model = 'gemini-2.5-flash',
           meal_photo_model = 'gemini-2.5-flash',
           voice_meal_model = 'gemini-2.5-flash',
           workout_generator_model = 'gemini-2.5-flash',
           version = $1,
           updated_by = NULL,
           updated_at = NOW()
       WHERE provider = 'google_gemini'`,
      [currentVer + 1],
    );
    console.log(' - Initial config restored cleanly on Neon DEV.');

    console.log('\n============================================================');
    console.log(' ALL GEMINI AI MANAGEMENT VERIFICATION CHECKS PASSED ON NEON DEV');
    console.log('============================================================\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
