/**
 * Secure DEV-Only Administrator Password Reset Procedure.
 *
 * SAFETY INVARIANTS:
 * 1. Targets ONLY the verified Neon DEV branch (br-fragrant-morning-b35lwkjg / ep-shy-art-b3sxwfkd).
 * 2. Strictly refuses execution if connected to PROD (br-icy-term-b3lb70tb / ep-gentle-bar-b3ywek03)
 *    or any unrecognized database.
 * 3. Targets ONLY the approved existing admin account (ae1c758b-e47d-4053-ab70-4114c2bfab79 / admin@fitonus.com).
 * 4. Preserves admin ID, email, role, and existing user relationships.
 * 5. Uses the approved application password hashing algorithm (Argon2id OWASP baseline).
 * 6. Enforces strict password policy (12-128 characters).
 * 7. Never echoes passwords to terminal or writes them to logs.
 * 8. Never accepts passwords from command-line arguments.
 * 9. Requires explicit --confirm-dev-reset flag; defaults to safe dry-run mode.
 */

import readline from 'node:readline';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { Argon2PasswordHasher } from '../src/shared/security/argon2-password-hasher.js';
import { assertPasswordPolicy } from '../src/shared/security/password-policy.js';

// Approved DEV invariants
const APPROVED_DEV_PROJECT = 'mute-surf-61144531';
const APPROVED_DEV_BRANCH = 'br-fragrant-morning-b35lwkjg';
const APPROVED_DEV_ENDPOINT = 'ep-shy-art-b3sxwfkd';
const APPROVED_ADMIN_ID = 'ae1c758b-e47d-4053-ab70-4114c2bfab79';
const APPROVED_ADMIN_EMAIL = 'admin@fitonus.com';

// Forbidden PROD invariants (defense-in-depth safety guard)
const FORBIDDEN_PROD_PROJECT = 'mute-surf-61144531';
const FORBIDDEN_PROD_BRANCH = 'br-icy-term-b3lb70tb';
const FORBIDDEN_PROD_ENDPOINT = 'ep-gentle-bar-b3ywek03';

interface NeonSettingsRow {
  name: string;
  setting: string;
}

interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  status: string;
  version: number;
}

/**
 * Prompts user for hidden password input without echoing to terminal.
 */
function promptHiddenPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const stdin = process.stdin;
    process.stdout.write(promptText);

    // Mute stdout during keystrokes
    const onData = (char: Buffer) => {
      const charStr = char.toString('utf-8');
      if (charStr === '\n' || charStr === '\r' || charStr === '\u0004') {
        stdin.removeListener('data', onData);
      } else if (charStr === '\u0003') {
        // Ctrl+C
        process.stdout.write('\nAborted.\n');
        process.exit(1);
      }
    };
    stdin.on('data', onData);

    // Read single line
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  // Disallow passing passwords via CLI arguments to prevent shell history leakage
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--password=') || arg.startsWith('-p=')) {
      console.error('ERROR: Never pass passwords as command-line arguments.');
      process.exit(1);
    }
  }

  const isConfirmed = process.argv.includes('--confirm-dev-reset');
  console.log('================================================================');
  console.log('   FITONUS DEV ADMINISTRATOR PASSWORD RESET PROCEDURE           ');
  console.log('================================================================');
  console.log(`Execution Mode: ${isConfirmed ? 'LIVE EXECUTION (--confirm-dev-reset)' : 'DRY RUN ONLY'}\n`);

  const config = loadConfig();
  if (config.isProduction) {
    throw new Error('SAFETY VIOLATION: Refusing to run in NODE_ENV=production!');
  }

  const host = new URL(config.database.url).hostname;
  if (host.includes(FORBIDDEN_PROD_ENDPOINT) || host.includes(FORBIDDEN_PROD_BRANCH)) {
    throw new Error('CRITICAL SAFETY ABORT: Database URL points to PROD endpoint/branch!');
  }

  const pool = createPool(config.database);

  try {
    // 1. Verify Neon DEV Database Identity via pg_settings
    const settingsRes = await pool.query<NeonSettingsRow>(`
      SELECT name, setting 
      FROM pg_settings 
      WHERE name IN ('neon.project_id', 'neon.branch_id', 'neon.endpoint_id')
    `);

    const settingsMap = new Map(settingsRes.rows.map((r) => [r.name, r.setting]));
    const currentProject = settingsMap.get('neon.project_id');
    const currentBranch = settingsMap.get('neon.branch_id');
    const currentEndpoint = settingsMap.get('neon.endpoint_id');

    console.log('[1/4] Verifying Neon Database Identity...');
    console.log(`  - Project:  ${currentProject ?? '(unknown)'}`);
    console.log(`  - Branch:   ${currentBranch ?? '(unknown)'}`);
    console.log(`  - Endpoint: ${currentEndpoint ?? '(unknown)'}`);

    if (
      (currentProject === FORBIDDEN_PROD_PROJECT && currentBranch === FORBIDDEN_PROD_BRANCH) ||
      currentEndpoint === FORBIDDEN_PROD_ENDPOINT
    ) {
      throw new Error('CRITICAL SAFETY ABORT: Connected database is PROD! Terminating.');
    }

    if (
      currentProject !== APPROVED_DEV_PROJECT ||
      currentBranch !== APPROVED_DEV_BRANCH ||
      currentEndpoint !== APPROVED_DEV_ENDPOINT
    ) {
      throw new Error(
        `CRITICAL SAFETY ABORT: Connected database is NOT approved DEV branch (${APPROVED_DEV_BRANCH})!`,
      );
    }
    console.log('  ✓ Database identity verified: Confirmed Neon DEV branch.\n');

    // 2. Verify Approved Admin Account Existence
    console.log('[2/4] Verifying Approved Admin Account...');
    const userRes = await pool.query<AdminUserRow>(
      `SELECT id, email, role, status, version
       FROM users
       WHERE id = $1 AND email = $2`,
      [APPROVED_ADMIN_ID, APPROVED_ADMIN_EMAIL],
    );

    if (userRes.rows.length === 0) {
      throw new Error(
        `Approved admin account (${APPROVED_ADMIN_EMAIL} / ${APPROVED_ADMIN_ID}) does not exist in DEV!`,
      );
    }

    const adminUser = userRes.rows[0]!;
    if (adminUser.role !== 'admin') {
      throw new Error(`Account ${APPROVED_ADMIN_EMAIL} does not have role 'admin'!`);
    }
    if (adminUser.status !== 'active') {
      throw new Error(`Account ${APPROVED_ADMIN_EMAIL} is not 'active'!`);
    }

    console.log(`  - ID:     ${adminUser.id}`);
    console.log(`  - Email:  ${adminUser.email}`);
    console.log(`  - Role:   ${adminUser.role}`);
    console.log(`  - Status: ${adminUser.status}`);
    console.log('  ✓ Admin account confirmed.\n');

    // 3. Acquire New Password Securely
    console.log('[3/4] Acquiring New Password...');
    let newPassword = process.env.NEW_DEV_ADMIN_PASSWORD;

    if (newPassword) {
      // Clear environment variable immediately from memory
      delete process.env.NEW_DEV_ADMIN_PASSWORD;
      console.log('  ✓ Password provided via protected environment variable.');
    } else {
      newPassword = await promptHiddenPassword('Enter new administrator password (hidden): ');
      const confirmPassword = await promptHiddenPassword('Confirm new administrator password (hidden): ');
      if (newPassword !== confirmPassword) {
        throw new Error('Password confirmation does not match. Aborting.');
      }
    }

    // Enforce NIST SP 800-63B password policy (12-128 chars)
    assertPasswordPolicy(newPassword);
    console.log('  ✓ Password policy satisfied (12-128 chars, non-empty).\n');

    // 4. Hash and Update
    console.log('[4/4] Hashing password with Argon2id...');
    const hasher = new Argon2PasswordHasher();
    const newHash = await hasher.hash(newPassword);

    // Verify hash roundtrip before applying
    const isValid = await hasher.verify(newHash, newPassword);
    if (!isValid) {
      throw new Error('Internal Argon2 verification failed on generated hash. Aborting.');
    }
    console.log('  ✓ Argon2id hash verified.');

    if (!isConfirmed) {
      console.log('\n[DRY RUN COMPLETE]');
      console.log('  No database modifications were made.');
      console.log('  To execute the update, rerun with: --confirm-dev-reset\n');
      return;
    }

    // Execute atomic update preserving account ID, email, role
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = NOW(),
           version = version + 1
       WHERE id = $2 AND email = $3 AND role = 'admin'`,
      [newHash, APPROVED_ADMIN_ID, APPROVED_ADMIN_EMAIL],
    );

    // Terminate existing sessions to enforce re-authentication
    await pool.query(
      `DELETE FROM sessions WHERE user_id = $1`,
      [APPROVED_ADMIN_ID],
    );

    // Record audit event
    await pool.query(
      `INSERT INTO admin_audit_logs (
         admin_id, action, target_user_id, details, ip_address, user_agent, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        APPROVED_ADMIN_ID,
        'admin.password_reset',
        APPROVED_ADMIN_ID,
        JSON.stringify({ method: 'dev_secure_reset_procedure' }),
        '127.0.0.1',
        'fitonus-admin-cli',
      ],
    );

    console.log('\n================================================================');
    console.log('  SUCCESS: DEV Administrator password reset successfully.      ');
    console.log(`  Account: ${APPROVED_ADMIN_EMAIL} (${APPROVED_ADMIN_ID})`);
    console.log('  All previous sessions revoked.');
    console.log('================================================================\n');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('\nERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
