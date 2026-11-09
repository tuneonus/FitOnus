import assert from 'node:assert/strict';
import request from 'supertest';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { createLogger } from '../src/shared/logging/logger.js';
import { createContainer } from '../src/container.js';
import { createApp } from '../src/app.js';

async function main() {
  console.log('=================================================================');
  console.log('FitOnus Phase 9.8: Settings & Privacy Neon Dev Verification');
  console.log('=================================================================\n');

  const config = loadConfig();
  const logger = createLogger({ level: 'silent', pretty: false });
  const pool = createPool({
    ...config.database,
    connectionTimeoutMs: 15000,
  });

  try {
    // 1. Neon Branch Verification
    console.log('--- Step 1: Neon Database Safety & Branch Verification ---');
    const branchRes = await pool.query<{ setting: string }>(
      "SELECT setting FROM pg_settings WHERE name = 'neon.branch_id'",
    );
    const currentBranch = branchRes.rows[0]?.setting;
    console.log(`Current Neon branch_id: ${currentBranch}`);

    const APPROVED_DEV_BRANCH = 'br-fragrant-morning-b35lwkjg';
    const PROTECTED_PROD_BRANCH = 'br-icy-term-b3lb70tb';

    if (currentBranch === PROTECTED_PROD_BRANCH) {
      console.error('FATAL: Connected to PROTECTED PRODUCTION BRANCH! Aborting immediately.');
      process.exit(1);
    }
    assert.equal(
      currentBranch,
      APPROVED_DEV_BRANCH,
      `Must be connected to approved development branch: ${APPROVED_DEV_BRANCH}`,
    );
    console.log('✓ Safety Verified: Connected to approved dev branch (br-fragrant-morning-b35lwkjg).\n');

    // 2. Schema Verification on user_settings
    console.log('--- Step 2: Verifying user_settings table schema ---');
    const colsRes = await pool.query<{ column_name: string; data_type: string }>(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_settings' ORDER BY ordinal_position",
    );
    const colNames = colsRes.rows.map((r) => r.column_name);
    console.log('Current columns in user_settings:', colNames.join(', '));

    assert.ok(colNames.includes('language'), 'Missing language column');
    assert.ok(colNames.includes('privacy_analytics'), 'Missing privacy_analytics column');
    assert.ok(colNames.includes('privacy_photo_retention'), 'Missing privacy_photo_retention column');
    assert.ok(colNames.includes('privacy_coach_sharing'), 'Missing privacy_coach_sharing column');
    assert.ok(colNames.includes('notification_schedule'), 'Missing notification_schedule column');
    console.log('✓ Migration 0012 columns verified in Neon Dev!\n');

    // 3. Initialize HTTP app with real container & database pool
    console.log('--- Step 3: Bootstrapping application container ---');
    const container = createContainer(config, pool);
    const app = createApp({ config, logger, container });

    // 4. Create isolated test user
    const testEmail = `dev_settings_qa_${Date.now()}@fitonus.test`;
    const testPassword = 'Password123!';
    console.log('Registering test user:', testEmail);
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        displayName: 'Settings QA Athlete',
      });
    assert.equal(regRes.status, 201, `Registration failed: ${JSON.stringify(regRes.body)}`);
    const token = regRes.body.data.accessToken;
    const userRes = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [testEmail]);
    const userId = userRes.rows[0]!.id;
    console.log(`✓ Test user registered: ${userId}\n`);

    // 5. Test initial GET /profile/settings
    console.log('--- Step 4: Testing GET /api/v1/profile/settings (Default Values) ---');
    const getRes1 = await request(app)
      .get('/api/v1/profile/settings')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(getRes1.status, 200, `GET settings failed: ${JSON.stringify(getRes1.body)}`);
    assert.equal(getRes1.body.data.userId, userId);
    assert.equal(getRes1.body.data.language, 'en');
    assert.equal(getRes1.body.data.themeMode, 'system');
    assert.equal(getRes1.body.data.unitSystem, 'metric');
    assert.equal(getRes1.body.data.privacyAnalytics, true);
    assert.equal(getRes1.body.data.privacyPhotoRetention, true);
    assert.equal(getRes1.body.data.privacyCoachSharing, false);
    console.log('✓ Initial settings match domain defaults!\n');

    // 6. Test PATCH /profile/settings
    console.log('--- Step 5: Testing PATCH /api/v1/profile/settings (Preferences Update) ---');
    const patchPayload = {
      language: 'ta',
      themeMode: 'dark',
      unitSystem: 'imperial',
      privacyAnalytics: false,
      privacyPhotoRetention: false,
      privacyCoachSharing: true,
      notificationSchedule: {
        workoutReminders: { enabled: true, time: '06:30' },
        dailySummary: { enabled: true, time: '21:00' },
      },
    };
    const patchRes = await request(app)
      .patch('/api/v1/profile/settings')
      .set('Authorization', `Bearer ${token}`)
      .send(patchPayload);
    assert.equal(patchRes.status, 200, `PATCH failed: ${JSON.stringify(patchRes.body)}`);
    assert.equal(patchRes.body.data.language, 'ta');
    assert.equal(patchRes.body.data.themeMode, 'dark');
    assert.equal(patchRes.body.data.unitSystem, 'imperial');
    assert.equal(patchRes.body.data.privacyAnalytics, false);
    assert.equal(patchRes.body.data.privacyPhotoRetention, false);
    assert.equal(patchRes.body.data.privacyCoachSharing, true);
    assert.deepEqual(patchRes.body.data.notificationSchedule, patchPayload.notificationSchedule);
    console.log('✓ PATCH response verified with updated settings!\n');

    // 7. Verify fresh GET to confirm persistence
    console.log('--- Step 6: Testing fresh GET to verify persistence ---');
    const getRes2 = await request(app)
      .get('/api/v1/profile/settings')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(getRes2.status, 200);
    assert.equal(getRes2.body.data.language, 'ta');
    assert.equal(getRes2.body.data.themeMode, 'dark');
    assert.equal(getRes2.body.data.unitSystem, 'imperial');
    assert.equal(getRes2.body.data.privacyAnalytics, false);
    assert.equal(getRes2.body.data.privacyPhotoRetention, false);
    assert.equal(getRes2.body.data.privacyCoachSharing, true);
    assert.deepEqual(getRes2.body.data.notificationSchedule, patchPayload.notificationSchedule);
    console.log('✓ Fresh GET confirmed persistence across requests!\n');

    // 8. Direct database row check
    console.log('--- Step 7: Verifying raw row in PostgreSQL ---');
    const dbRowRes = await pool.query<{
      user_id: string;
      language: string;
      theme_mode: string;
      unit_system: string;
      privacy_analytics: boolean;
      privacy_photo_retention: boolean;
      privacy_coach_sharing: boolean;
    }>('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
    assert.equal(dbRowRes.rows.length, 1);
    const dbRow = dbRowRes.rows[0];
    assert.equal(dbRow?.language, 'ta');
    assert.equal(dbRow?.theme_mode, 'dark');
    assert.equal(dbRow?.unit_system, 'imperial');
    assert.equal(dbRow?.privacy_analytics, false);
    assert.equal(dbRow?.privacy_photo_retention, false);
    assert.equal(dbRow?.privacy_coach_sharing, true);
    console.log('✓ Raw PostgreSQL row verified with exact persisted values!\n');

    // 9. Password Change Test
    console.log('--- Step 8: Testing POST /api/v1/auth/change-password ---');
    const newPassword = 'NewPassword456!';
    const changePassRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: testPassword,
        newPassword: newPassword,
      });
    assert.equal(changePassRes.status, 200);
    console.log('✓ Password successfully updated and verified!\n');

    // 10. Account Deletion & Cascade Verification
    console.log('--- Step 9: Testing DELETE /api/v1/users/me & Cascade Cleanup ---');
    const delRes = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: newPassword });
    assert.equal(delRes.status, 200);

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    assert.equal(userCheck.rows.length, 0, 'User record must be removed');
    const settingsCheck = await pool.query('SELECT user_id FROM user_settings WHERE user_id = $1', [userId]);
    assert.equal(settingsCheck.rows.length, 0, 'Settings record must be cascade deleted');
    console.log('✓ User and settings cleanly deleted from Neon Dev!\n');

    console.log('=================================================================');
    console.log('PHASE 9.8 NEON DEV PERSISTENCE & INTEGRATION VERIFICATION COMPLETE: ALL PASS');
    console.log('=================================================================');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
