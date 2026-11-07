/**
 * FitOnus — Phase 7 Challenges & Gamification E2E Verification Runner
 *
 * Usage:
 *   node --env-file-if-exists=.env --import tsx scripts/e2e-phase7.ts
 *   BASE_URL=https://fitonus-api-dev.onrender.com node --env-file-if-exists=.env --import tsx scripts/e2e-phase7.ts
 *
 * Requirements:
 *   - SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD set in environment
 *   - Outbound HTTPS access to Render Development API
 *
 * Safety:
 *   - Targets Development environment only (never production)
 *   - Creates and immediately archives test challenges on completion
 *   - Never modifies existing user data
 *   - Never reruns Migration 0011
 *   - Credentials read from env — never hardcoded
 */

/* eslint-disable prefer-const */
import * as https from 'https';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? 'https://fitonus-api-dev.onrender.com';
const { hostname, port: portStr } = new URL(BASE_URL);
const port = Number(portStr ?? 443);
const API = '/api/v1';

// ─── HTTP Client ─────────────────────────────────────────────────────────────

interface Response<T = unknown> {
  status: number;
  body: T | null;
}

function request<T = unknown>(
  method: string,
  path: string,
  body: unknown,
  token?: string,
  timeoutMs = 20000,
): Promise<Response<T>> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname,
        port,
        path,
        method,
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json: T | null = null;
          try {
            json = JSON.parse(data) as T;
          } catch {
            // ignore malformed or empty non-JSON response bodies
          }
          resolve({ status: res.statusCode ?? 0, body: json });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Test Harness ─────────────────────────────────────────────────────────────

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  status: number;
  expected: number;
  detail: string;
  skipped?: boolean;
}

const results: TestResult[] = [];
let passed = 0;
let failed = 0;
let skipped = 0;

function check(
  id: string,
  name: string,
  status: number,
  expected: number,
  condition = true,
  detail = '',
): boolean {
  const ok = status === expected && condition;
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${id} [HTTP ${status}] ${name}${detail ? ` | ${detail}` : ''}`);
  results.push({ id, name, passed: ok, status, expected, detail });
  if (ok) passed++;
  else failed++;
  return ok;
}

function skip(id: string, name: string, reason: string): void {
  console.log(`⏭️  ${id} SKIPPED — ${reason}`);
  results.push({ id, name, passed: false, status: 0, expected: 0, detail: reason, skipped: true });
  skipped++;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPwd = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPwd) {
    console.error('ERROR: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in environment.');
    process.exit(1);
  }

  const ts = Date.now();
  const challengeSlug = `e2e-phase7-${ts}`;
  let adminToken: string;
  let memberToken: string;
  let challengeId: string;
  let occurrenceId: string | undefined;

  console.log('═'.repeat(60));
  console.log('  FITONUS — PHASE 7 E2E VERIFICATION RUNNER');
  console.log(`  Target:  ${BASE_URL}`);
  console.log(`  Time:    ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  // ── T01: Health ──────────────────────────────────────────────
  console.log('\n── T01: Health Checks ──');
  const live = await request('GET', '/health/live', null);
  check(
    'T01a',
    'GET /health/live → 200',
    live.status,
    200,
    (live.body as any)?.data?.status === 'ok',
    (live.body as any)?.data?.status,
  );

  const ready = await request('GET', '/health/ready', null);
  check(
    'T01b',
    'GET /health/ready → 200',
    ready.status,
    200,
    (ready.body as any)?.data?.status === 'ok',
    (ready.body as any)?.data?.status,
  );

  // ── T02: Unauthenticated Rejection ───────────────────────────
  console.log('\n── T02: Unauthenticated Rejection ──');
  const r02a = await request('GET', `${API}/challenges`, null);
  check(
    'T02a',
    'GET /challenges (no token) → 401',
    r02a.status,
    401,
    (r02a.body as any)?.error?.code === 'UNAUTHENTICATED',
    (r02a.body as any)?.error?.code,
  );

  const r02b = await request('GET', `${API}/admin/challenges`, null);
  check(
    'T02b',
    'GET /admin/challenges (no token) → 401',
    r02b.status,
    401,
    (r02b.body as any)?.error?.code === 'UNAUTHENTICATED',
    (r02b.body as any)?.error?.code,
  );

  const r02c = await request('GET', `${API}/gamification/summary`, null);
  check(
    'T02c',
    'GET /gamification/summary (no token) → 401',
    r02c.status,
    401,
    (r02c.body as any)?.error?.code === 'UNAUTHENTICATED',
    (r02c.body as any)?.error?.code,
  );

  // ── T03: Admin Auth ──────────────────────────────────────────
  console.log('\n── T03: Admin Authentication ──');
  const adminLogin = await request('POST', `${API}/admin/auth/login`, {
    email: adminEmail,
    password: adminPwd,
  });
  if (
    !check(
      'T03a',
      'POST /admin/auth/login → 200',
      adminLogin.status,
      200,
      !!(adminLogin.body as any)?.data?.accessToken,
      `token: ${!!(adminLogin.body as any)?.data?.accessToken}`,
    )
  ) {
    console.error('FATAL: Admin login failed — aborting');
    return;
  }
  adminToken = (adminLogin.body as any).data.accessToken;

  const r03b = await request('GET', `${API}/admin/challenges`, null, adminToken);
  check(
    'T03b',
    'GET /admin/challenges (admin) → 200',
    r03b.status,
    200,
    Array.isArray((r03b.body as any)?.data),
    `count: ${(r03b.body as any)?.data?.length}`,
  );

  // ── T04: Member Registration & Login ─────────────────────────
  console.log('\n── T04: Member Authentication ──');
  const memberEmail = `e2e-member-${ts}@fitonus-dev.test`;
  const memberPwd = `E2ePhase7#${ts.toString().slice(-6)}!`;
  const reg = await request('POST', `${API}/auth/register`, {
    email: memberEmail,
    displayName: 'E2E Phase7 Member',
    password: memberPwd,
  });
  if (
    !check(
      'T04a',
      'POST /auth/register → 201',
      reg.status,
      201,
      !!(reg.body as any)?.data?.accessToken,
      `token: ${!!(reg.body as any)?.data?.accessToken}`,
    )
  ) {
    console.error('FATAL: Member registration failed — aborting');
    return;
  }

  const memberLogin = await request('POST', `${API}/auth/login`, { email: memberEmail, password: memberPwd });
  if (
    !check(
      'T04b',
      'POST /auth/login (member) → 200',
      memberLogin.status,
      200,
      !!(memberLogin.body as any)?.data?.accessToken,
      `token: ${!!(memberLogin.body as any)?.data?.accessToken}`,
    )
  ) {
    console.error('FATAL: Member login failed — aborting');
    return;
  }
  memberToken = (memberLogin.body as any).data.accessToken;

  // ── T05: Admin RBAC ──────────────────────────────────────────
  console.log('\n── T05: Admin RBAC Enforcement ──');
  const r05 = await request('GET', `${API}/admin/challenges`, null, memberToken);
  check(
    'T05',
    'GET /admin/challenges (member token) → 403',
    r05.status,
    403,
    true,
    (r05.body as any)?.error?.code,
  );

  // ── T06: Create Challenge ────────────────────────────────────
  console.log('\n── T06: Create Test Challenge ──');
  const r06 = await request(
    'POST',
    `${API}/admin/challenges`,
    {
      slug: challengeSlug,
      title: `E2E Phase 7 Test Challenge ${new Date().toISOString().slice(0, 10)}`,
      description: 'Phase 7 E2E test challenge — created by automated runner, safe to delete',
      cadence: 'daily',
      category: 'workout',
      metricType: 'workout_count',
      targetValue: 1,
      rewardPoints: 10,
      autoEnroll: false,
    },
    adminToken,
  );
  if (
    !check(
      'T06',
      'POST /admin/challenges → 201',
      r06.status,
      201,
      !!(r06.body as any)?.data?.id,
      `id: ${(r06.body as any)?.data?.id}`,
    )
  ) {
    console.error('FATAL: Challenge creation failed — aborting');
    return;
  }
  challengeId = (r06.body as any).data.id;
  console.log(`   challengeId: ${challengeId} | status: ${(r06.body as any)?.data?.status}`);

  // ── T07: Publish Challenge ───────────────────────────────────
  console.log('\n── T07: Publish Challenge ──');
  const r07 = await request('POST', `${API}/admin/challenges/${challengeId}/publish`, null, adminToken);
  check(
    'T07',
    'POST /admin/challenges/:id/publish → 200',
    r07.status,
    200,
    (r07.body as any)?.data?.status === 'published',
    `status: ${(r07.body as any)?.data?.status}`,
  );

  // ── T08: Admin Get Single Challenge ─────────────────────────
  console.log('\n── T08: Admin Read Single Challenge ──');
  const r08 = await request('GET', `${API}/admin/challenges/${challengeId}`, null, adminToken);
  check(
    'T08',
    'GET /admin/challenges/:id → 200',
    r08.status,
    200,
    (r08.body as any)?.data?.id === challengeId,
    `id match: ${(r08.body as any)?.data?.id === challengeId}`,
  );

  // ── T09: Member Challenge Listing + Occurrence Discovery ─────
  console.log('\n── T09: Member Challenge Listing ──');
  const r09 = await request('GET', `${API}/challenges`, null, memberToken);
  check(
    'T09',
    'GET /challenges (member) → 200',
    r09.status,
    200,
    Array.isArray((r09.body as any)?.data),
    `count: ${(r09.body as any)?.data?.length ?? 0}`,
  );

  const occurrences = ((r09.body as any)?.data ?? []) as Array<any>;
  const ourEntry = occurrences.find(
    (o) => o.challenge?.id === challengeId || o.occurrence?.challengeId === challengeId,
  );
  occurrenceId = ourEntry?.occurrence?.id ?? '';
  console.log(`   Occurrence for test challenge: ${occurrenceId || 'none yet (scheduler-driven)'}`);

  // ── T10: Enroll ──────────────────────────────────────────────
  console.log('\n── T10: Member Enroll ──');
  if (!occurrenceId) {
    skip(
      'T10',
      'POST /challenges/:occurrenceId/enroll',
      'No active occurrence yet (daily scheduler not triggered)',
    );
  } else {
    const r10 = await request('POST', `${API}/challenges/${occurrenceId}/enroll`, null, memberToken);
    check(
      'T10',
      'POST /challenges/:occurrenceId/enroll → 201',
      r10.status,
      201,
      !!(r10.body as any)?.data?.id,
      JSON.stringify((r10.body as any)?.data ?? (r10.body as any)?.error ?? {}).slice(0, 80),
    );
  }

  // ── T11: Progress ─────────────────────────────────────────────
  console.log('\n── T11: Progress Calculation ──');
  if (!occurrenceId) {
    skip('T11', 'GET /challenges/:occurrenceId/progress', 'No occurrence available');
  } else {
    const r11 = await request('GET', `${API}/challenges/${occurrenceId}/progress`, null, memberToken);
    const pd = (r11.body as any)?.data;
    check(
      'T11',
      'GET /challenges/:occurrenceId/progress → 200',
      r11.status,
      200,
      !!pd,
      `progress: ${pd?.currentProgress}/${pd?.targetValue} status: ${pd?.status}`,
    );
  }

  // ── T12: Gamification Summary ────────────────────────────────
  console.log('\n── T12: Gamification Summary ──');
  const r12 = await request('GET', `${API}/gamification/summary`, null, memberToken);
  const gd = (r12.body as any)?.data;
  check(
    'T12',
    'GET /gamification/summary → 200',
    r12.status,
    200,
    !!gd,
    `level: ${gd?.currentLevel} points: ${gd?.totalPoints}`,
  );

  // ── T13: Badges ──────────────────────────────────────────────
  console.log('\n── T13: Gamification Badges ──');
  const r13 = await request('GET', `${API}/gamification/badges`, null, memberToken);
  check(
    'T13',
    'GET /gamification/badges → 200 (≥7 system badges)',
    r13.status,
    200,
    ((r13.body as any)?.data?.length ?? 0) >= 7,
    `count: ${(r13.body as any)?.data?.length}`,
  );

  // ── T14: Points History ──────────────────────────────────────
  console.log('\n── T14: Points History ──');
  const r14 = await request('GET', `${API}/gamification/points/history`, null, memberToken);
  check(
    'T14',
    'GET /gamification/points/history → 200',
    r14.status,
    200,
    Array.isArray((r14.body as any)?.data),
    `entries: ${(r14.body as any)?.data?.length ?? 0}`,
  );

  // ── T15: Challenge History ───────────────────────────────────
  console.log('\n── T15: Challenge History ──');
  const r15 = await request('GET', `${API}/challenges/history`, null, memberToken);
  check(
    'T15',
    'GET /challenges/history → 200',
    r15.status,
    200,
    Array.isArray((r15.body as any)?.data),
    `count: ${(r15.body as any)?.data?.length ?? 0}`,
  );

  // ── Duplicate Enrollment Prevention ─────────────────────────
  if (occurrenceId) {
    console.log('\n── Duplicate Enrollment Prevention ──');
    const rDupe = await request('POST', `${API}/challenges/${occurrenceId}/enroll`, null, memberToken);
    check(
      'T-dupe-enroll',
      'Duplicate enroll → 409 CONFLICT',
      rDupe.status,
      409,
      true,
      (rDupe.body as any)?.error?.code,
    );
  }

  // ── Claim Anti-Cheat (ineligible) ────────────────────────────
  if (occurrenceId) {
    console.log('\n── Claim Anti-Cheat (expect rejection for 0 progress) ──');
    const rClaim = await request('POST', `${API}/challenges/${occurrenceId}/claim`, null, memberToken);
    // Fresh member has no workout data — claim should be rejected
    const claimRejected = rClaim.status === 400 || rClaim.status === 422;
    const claimMsg = (rClaim.body as any)?.error?.message ?? '';
    check(
      'T-claim-anticheat',
      'Claim with 0 progress → 400 (ineligible)',
      rClaim.status,
      400,
      claimRejected,
      claimMsg.slice(0, 80),
    );
  }

  // ── Cleanup ──────────────────────────────────────────────────
  console.log('\n── Cleanup: Archiving test challenge ──');
  if (challengeId) {
    const cleanup = await request('POST', `${API}/admin/challenges/${challengeId}/archive`, null, adminToken);
    console.log(`   Archive: ${cleanup.status} ${(cleanup.body as any)?.data?.status ?? 'unknown'}`);
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`  PASSED: ${passed} | FAILED: ${failed} | SKIPPED: ${skipped}`);
  console.log(`  TOTAL CHECKED: ${results.filter((r) => !r.skipped).length}`);
  if (failed > 0) {
    console.log('\n  Failed tests:');
    results
      .filter((r) => !r.passed && !r.skipped)
      .forEach((r) => {
        console.log(`    ❌ ${r.id} — got ${r.status}, expected ${r.expected} | ${r.detail}`);
      });
  }
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e: Error) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
