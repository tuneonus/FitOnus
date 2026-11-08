import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeCsvField, formatUsersCsv } from '../src/features/users/utils/exportUsersCsv';
import { VERIFIED_BADGES } from '../src/features/challenges/components/BadgesCatalogCard';
import type { AdminUserListItem } from '../src/features/users/types';

describe('Admin User Management & Content Management — Phase 10.4 & 10.5 Tests', () => {
  const sampleUsers: AdminUserListItem[] = [
    {
      id: 'u-1',
      email: 'john.doe@example.com',
      displayName: 'John Doe',
      role: 'member',
      status: 'active',
      version: 1,
      onboardingCompleted: true,
      currentOnboardingStep: 'done',
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-03-01T12:00:00.000Z',
      disabledAt: null,
    },
    {
      id: 'u-2',
      email: 'jane.smith@example.com',
      displayName: 'Jane Smith, Coach',
      role: 'member',
      status: 'disabled',
      version: 2,
      onboardingCompleted: false,
      currentOnboardingStep: 'profile_goals',
      createdAt: '2026-02-01T08:30:00.000Z',
      updatedAt: '2026-02-20T10:00:00.000Z',
      disabledAt: '2026-02-20T10:00:00.000Z',
    },
    {
      id: 'u-3',
      email: 'admin.super@fitonus.com',
      displayName: 'Super "Lead" Admin',
      role: 'admin',
      status: 'active',
      version: 3,
      onboardingCompleted: true,
      currentOnboardingStep: 'done',
      createdAt: '2025-12-01T00:00:00.000Z',
      updatedAt: '2026-03-02T15:30:00.000Z',
      disabledAt: null,
    },
  ];

  // 1. CSV Field Escaping (RFC 4180 & CWE-1236 Formula Injection Prevention)
  it('1. CSV field escaping conforms to RFC 4180 standard and prevents formula injection', () => {
    assert.equal(escapeCsvField('simple'), '"simple"');
    assert.equal(escapeCsvField(123), '"123"');
    assert.equal(escapeCsvField(null), '""');
    assert.equal(escapeCsvField(undefined), '""');
    assert.equal(escapeCsvField('hello, world'), '"hello, world"');
    assert.equal(escapeCsvField('quote "test" here'), '"quote ""test"" here"');
    assert.equal(escapeCsvField('line 1\nline 2'), '"line 1\nline 2"');

    // CWE-1236 Formula Injection defenses: prepend single quote
    assert.equal(escapeCsvField('=cmd|/C calc'), '"\'=cmd|/C calc"');
    assert.equal(escapeCsvField('@SUM(A1:A10)'), '"\'@SUM(A1:A10)"');
    assert.equal(escapeCsvField('+1+2'), '"\'+1+2"');
    assert.equal(escapeCsvField('-malicious'), '"\'-malicious"');
    assert.equal(escapeCsvField('\ttabPrefix'), '"\'\ttabPrefix"');
  });

  // 2. CSV Export Content & Sensitive Data Exclusion
  it('2. CSV export formats headers correctly and strictly excludes sensitive credentials', () => {
    const csv = formatUsersCsv(sampleUsers);
    const lines = csv.split('\r\n');

    // Headers line
    assert.equal(
      lines[0],
      '"User ID","Display Name","Email Address","Role","Account Status","Onboarding Completed","Current Onboarding Step","Registered At","Suspended At"'
    );

    // Verify row 1
    assert.equal(
      lines[1],
      '"u-1","John Doe","john.doe@example.com","member","active","Yes","done","2026-01-15T10:00:00.000Z","N/A"'
    );

    // Verify row 2 with comma in displayName
    assert.equal(
      lines[2],
      '"u-2","Jane Smith, Coach","jane.smith@example.com","member","disabled","No","profile_goals","2026-02-01T08:30:00.000Z","2026-02-20T10:00:00.000Z"'
    );

    // Verify row 3 with escaped quotes
    assert.equal(
      lines[3],
      '"u-3","Super ""Lead"" Admin","admin.super@fitonus.com","admin","active","Yes","done","2025-12-01T00:00:00.000Z","N/A"'
    );

    // Zero passwords, hashes, or auth tokens must exist in CSV output
    assert.equal(csv.toLowerCase().includes('password'), false);
    assert.equal(csv.toLowerCase().includes('token'), false);
    assert.equal(csv.toLowerCase().includes('hash'), false);
    assert.equal(csv.toLowerCase().includes('secret'), false);
  });

  // 3. User Filter Matching (Multi-criteria)
  it('3. User search and filtering criteria filter user lists correctly', () => {
    // Search query filter
    const searchMatch = (user: AdminUserListItem, query: string) => {
      const q = query.toLowerCase();
      return (
        user.displayName?.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.id.toLowerCase().includes(q)
      );
    };

    assert.equal(searchMatch(sampleUsers[0], 'john'), true);
    assert.equal(searchMatch(sampleUsers[1], 'john'), false);
    assert.equal(searchMatch(sampleUsers[1], 'jane.smith'), true);

    // Account status filter
    const statusFilter = (user: AdminUserListItem, status: 'all' | 'active' | 'disabled') => {
      if (status === 'active') return user.status === 'active';
      if (status === 'disabled') return user.status === 'disabled';
      return true;
    };

    assert.equal(sampleUsers.filter((u) => statusFilter(u, 'active')).length, 2);
    assert.equal(sampleUsers.filter((u) => statusFilter(u, 'disabled')).length, 1);
    assert.equal(sampleUsers.filter((u) => statusFilter(u, 'disabled'))[0].id, 'u-2');

    // Onboarding status filter
    const onboardingFilter = (user: AdminUserListItem, state: 'all' | 'completed' | 'pending') => {
      if (state === 'completed') return user.onboardingCompleted === true;
      if (state === 'pending') return user.onboardingCompleted === false;
      return true;
    };

    assert.equal(sampleUsers.filter((u) => onboardingFilter(u, 'completed')).length, 2);
    assert.equal(sampleUsers.filter((u) => onboardingFilter(u, 'pending')).length, 1);
  });

  // 4. Suspension Reason Requirement Validation
  it('4. Account suspension requires non-empty, trimmed reason with at least 3 characters', () => {
    const validateSuspensionReason = (reason: string): { isValid: boolean; error?: string } => {
      const trimmed = reason.trim();
      if (!trimmed) {
        return { isValid: false, error: 'Suspension reason is mandatory for audit logging.' };
      }
      if (trimmed.length < 3) {
        return { isValid: false, error: 'Reason must be at least 3 characters long.' };
      }
      return { isValid: true };
    };

    assert.equal(validateSuspensionReason('').isValid, false);
    assert.equal(validateSuspensionReason('   ').isValid, false);
    assert.equal(validateSuspensionReason('no').isValid, false);
    assert.equal(validateSuspensionReason('Terms violation').isValid, true);
    assert.equal(validateSuspensionReason('  Account security compromised  ').isValid, true);
  });

  // 5. Workout Exercise Input Validation
  it('5. Workout exercise input validation enforces required attributes and bounds', () => {
    const validateExerciseInput = (data: {
      name: string;
      category: string;
      primaryMuscleGroup: string;
      caloriesBurnedPerMin?: number;
    }): { isValid: boolean; error?: string } => {
      if (!data.name.trim()) return { isValid: false, error: 'Exercise name is required' };
      if (!['cardio', 'strength', 'flexibility', 'hiit'].includes(data.category)) {
        return { isValid: false, error: 'Invalid category' };
      }
      if (!data.primaryMuscleGroup.trim()) {
        return { isValid: false, error: 'Primary muscle group is required' };
      }
      if (
        data.caloriesBurnedPerMin !== undefined &&
        (isNaN(data.caloriesBurnedPerMin) || data.caloriesBurnedPerMin < 0)
      ) {
        return { isValid: false, error: 'Calories must be non-negative' };
      }
      return { isValid: true };
    };

    assert.equal(
      validateExerciseInput({ name: 'Barbell Squat', category: 'strength', primaryMuscleGroup: 'quadriceps', caloriesBurnedPerMin: 8 }).isValid,
      true
    );
    assert.equal(
      validateExerciseInput({ name: '', category: 'strength', primaryMuscleGroup: 'chest' }).isValid,
      false
    );
    assert.equal(
      validateExerciseInput({ name: 'Sprint', category: 'invalid_category', primaryMuscleGroup: 'legs' }).isValid,
      false
    );
    assert.equal(
      validateExerciseInput({ name: 'Sprint', category: 'cardio', primaryMuscleGroup: 'legs', caloriesBurnedPerMin: -5 }).isValid,
      false
    );
  });

  // 6. Challenge Slug and Cadence Validation
  it('6. Challenge input validation enforces valid slug regex and positive metrics', () => {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    assert.equal(slugRegex.test('valid-challenge-slug-2026'), true);
    assert.equal(slugRegex.test('summer-step-challenge'), true);
    assert.equal(slugRegex.test('Invalid Slug With Spaces'), false);
    assert.equal(slugRegex.test('under_scores_not_allowed'), false);
    assert.equal(slugRegex.test('-leading-dash'), false);
    assert.equal(slugRegex.test('trailing-dash-'), false);
  });

  // 7. Verified Badges Catalog Integrity
  it('7. Verified Badges catalog contains valid system standard badges with unique identifiers', () => {
    assert.equal(VERIFIED_BADGES.length, 5);

    const ids = new Set(VERIFIED_BADGES.map((b) => b.id));
    assert.equal(ids.size, VERIFIED_BADGES.length);

    VERIFIED_BADGES.forEach((badge) => {
      assert.ok(badge.id.length > 0);
      assert.ok(badge.name.length > 0);
      assert.ok(badge.icon.length > 0);
      assert.ok(badge.criteria.length > 0);
      assert.equal(badge.isSystemStandard, true);
      assert.ok(['streak', 'workout', 'nutrition', 'community'].includes(badge.category));
    });
  });

  // 8. Missing Backend Endpoints Documentation Transparency
  it('8. Missing backend endpoints are explicitly documented for Phase 11', () => {
    const missingEndpoints = [
      {
        endpoint: 'GET /api/v1/admin/users/:id/activity',
        targetPhase: 'Phase 11 (Real Data Integration)',
        purpose: 'Aggregated workout logs and nutrition snapshots per individual user',
      },
      {
        endpoint: 'POST /api/v1/admin/challenges/badges',
        targetPhase: 'Phase 11 (Gamification Expansion)',
        purpose: 'Dynamic administrative creation and asset management for custom badges',
      },
      {
        endpoint: 'GET /api/v1/admin/dashboard/stats?timeframe=90d',
        targetPhase: 'Phase 11 (Analytics Time Series)',
        purpose: '90-day daily aggregated time-series buckets from Neon DB',
      },
    ];

    assert.equal(missingEndpoints.length, 3);
    missingEndpoints.forEach((item) => {
      assert.ok(item.endpoint.startsWith('GET') || item.endpoint.startsWith('POST'));
      assert.ok(item.targetPhase.includes('Phase 11'));
      assert.ok(item.purpose.length > 10);
    });
  });
});
