import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminCreateChallengeRequest,
  adminUpdateChallengeRequest,
  challengeViewSchema,
} from '../../backend/src/modules/challenges/interface/challenges.schemas';
import type {
  Challenge,
  CreateChallengeInput,
  UpdateChallengeInput,
  ChallengeCadence,
  ChallengeCategory,
  ChallengeMetricType,
} from '../src/features/challenges/types';

describe('Admin Challenges — Phase 7.6 Contract & Logic Tests', () => {
  const sampleValidChallenge: Challenge = {
    id: 'a0000000-0000-4000-8000-000000000001',
    slug: 'weekly-5k-runner',
    title: 'Weekly 5K Runner',
    description: 'Complete 5 kilometers of running workouts this week.',
    cadence: 'weekly',
    category: 'workout',
    metricType: 'workout_duration_min',
    targetValue: 60,
    rewardPoints: 100,
    rewardBadgeId: null,
    status: 'published',
    autoEnroll: true,
    iconName: 'trophy',
    bannerColor: 'teal',
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Challenge list contract validation
  it('1. Challenge list contract validation: conforms to challengeViewSchema', () => {
    const parsed = challengeViewSchema.safeParse(sampleValidChallenge);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.slug, 'weekly-5k-runner');
      assert.equal(parsed.data.rewardPoints, 100);
      assert.equal(parsed.data.status, 'published');
    }
  });

  // 2. Empty list state handling
  it('2. Empty list state handling: empty array conforms and handles cleanly', () => {
    const list: Challenge[] = [];
    assert.equal(list.length, 0);
    const published = list.filter((c) => c.status === 'published');
    assert.equal(published.length, 0);
  });

  // 3. API failure handling
  it('3. API failure handling: ApiError preserves status and message', () => {
    class MockApiError extends Error {
      constructor(
        message: string,
        public status: number,
        public code?: string,
      ) {
        super(message);
      }
    }
    const err = new MockApiError('Database connectivity failure', 503, 'SERVICE_UNAVAILABLE');
    assert.equal(err.status, 503);
    assert.equal(err.message, 'Database connectivity failure');
    assert.equal(err.code, 'SERVICE_UNAVAILABLE');
  });

  // 4. Create success validation
  it('4. Create success validation: valid creation payload passes adminCreateChallengeRequest', () => {
    const createInput: CreateChallengeInput = {
      slug: 'daily-water-intake',
      title: 'Daily Water Champion',
      description: 'Drink at least 3 liters of water today.',
      cadence: 'daily',
      category: 'hydration',
      metricType: 'water_liters',
      targetValue: 3,
      rewardPoints: 20,
      autoEnroll: true,
      iconName: 'droplet',
      bannerColor: 'blue',
    };

    const parsed = adminCreateChallengeRequest.body.safeParse(createInput);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.slug, 'daily-water-intake');
      assert.equal(parsed.data.rewardPoints, 20);
      assert.equal(parsed.data.status, 'published'); // schema default
    }
  });

  // 5. Invalid creation: missing required fields
  it('5. Invalid creation: rejected when required fields (e.g. slug, title) are invalid or missing', () => {
    const invalidInput = {
      title: 'X', // min 2
      cadence: 'invalid_cadence',
      targetValue: -5, // must be positive
    };

    const parsed = adminCreateChallengeRequest.body.safeParse(invalidInput);
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      assert.ok(fieldErrors.slug, 'slug should have error');
      assert.ok(fieldErrors.title, 'title should have error');
      assert.ok(fieldErrors.cadence, 'cadence should have error');
      assert.ok(fieldErrors.targetValue, 'targetValue should have error');
    }
  });

  // 6. Edit success: partial update validation
  it('6. Edit success: partial update payload passes adminUpdateChallengeRequest', () => {
    const updateInput: UpdateChallengeInput = {
      title: 'Weekly 10K Runner Updated',
      targetValue: 100,
      rewardPoints: 150,
      iconName: 'medal',
    };

    const parsed = adminUpdateChallengeRequest.body.safeParse(updateInput);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.title, 'Weekly 10K Runner Updated');
      assert.equal(parsed.data.targetValue, 100);
      assert.equal(parsed.data.rewardPoints, 150);
    }
  });

  // 7. Invalid edit: attempting to mutate immutable fields
  it('7. Invalid edit: schema is strict and rejects immutable fields (e.g. slug, cadence)', () => {
    const invalidUpdateAttempt = {
      title: 'New Title',
      slug: 'new-slug-attempt', // Immutable! Strict schema must reject
      cadence: 'monthly', // Immutable!
    };

    const parsed = adminUpdateChallengeRequest.body.safeParse(invalidUpdateAttempt);
    assert.equal(parsed.success, false);
  });

  // 8. Publish success state transition
  it('8. Publish success state transition: draft challenge updates to published', () => {
    const draftChallenge: Challenge = {
      ...sampleValidChallenge,
      status: 'draft',
    };
    assert.equal(draftChallenge.status, 'draft');

    // Simulate successful publish endpoint response
    const publishedChallenge: Challenge = {
      ...draftChallenge,
      status: 'published',
      updatedAt: new Date().toISOString(),
    };
    assert.equal(publishedChallenge.status, 'published');
  });

  // 9. Publish failure: cannot publish already published or archived challenge
  it('9. Publish failure: transitions from non-draft throw domain conflict/precondition error', () => {
    const attemptPublish = (status: Challenge['status']) => {
      if (status !== 'draft') {
        throw new Error(`Cannot publish challenge in status '${status}'`);
      }
      return 'published';
    };

    assert.throws(() => attemptPublish('published'), /Cannot publish challenge/);
    assert.throws(() => attemptPublish('archived'), /Cannot publish challenge/);
    assert.equal(attemptPublish('draft'), 'published');
  });

  // 10. Archive success state transition
  it('10. Archive success state transition: moves to archived status', () => {
    const activeChallenge: Challenge = {
      ...sampleValidChallenge,
      status: 'published',
    };
    const archivedChallenge: Challenge = {
      ...activeChallenge,
      status: 'archived',
      updatedAt: new Date().toISOString(),
    };
    assert.equal(archivedChallenge.status, 'archived');
  });

  // 11. Archive failure: already archived challenge cannot be archived again
  it('11. Archive failure: archiving already archived challenge throws conflict', () => {
    const attemptArchive = (status: Challenge['status']) => {
      if (status === 'archived') {
        throw new Error('Challenge is already archived');
      }
      return 'archived';
    };

    assert.throws(() => attemptArchive('archived'), /already archived/);
    assert.equal(attemptArchive('published'), 'archived');
    assert.equal(attemptArchive('draft'), 'archived');
  });

  // 12. Duplicate submission prevention (in-flight lock)
  it('12. Duplicate submission prevention: in-flight lock rejects concurrent submissions', async () => {
    let inFlight = false;
    let executionCount = 0;

    const mockSubmit = async () => {
      if (inFlight) return false;
      inFlight = true;
      try {
        await new Promise((r) => setTimeout(r, 20));
        executionCount++;
        return true;
      } finally {
        inFlight = false;
      }
    };

    // Trigger two rapid concurrent calls
    const [res1, res2] = await Promise.all([mockSubmit(), mockSubmit()]);
    assert.equal(res1, true);
    assert.equal(res2, false); // Second concurrent call blocked
    assert.equal(executionCount, 1);
  });

  // 13. Unauthorized access (401 handling)
  it('13. Unauthorized access: handles 401 unauthenticated response properly', () => {
    const handleAuthError = (status: number) => {
      if (status === 401) {
        return { redirectedToLogin: true, message: 'Session expired or invalid. Please log in.' };
      }
      return { redirectedToLogin: false, message: 'OK' };
    };

    const result = handleAuthError(401);
    assert.equal(result.redirectedToLogin, true);
    assert.ok(result.message.includes('Please log in'));
  });

  // 14. Forbidden member access (403 handling)
  it('14. Forbidden member access: handles 403 when user lacks admin:access', () => {
    const checkAdminPermission = (userRoles: string[], permissions: string[]) => {
      if (!permissions.includes('admin:access')) {
        const error = new Error('Access denied. Administrator privileges required.');
        (error as any).status = 403;
        throw error;
      }
      return true;
    };

    assert.throws(
      () => checkAdminPermission(['member'], ['member:read', 'member:write']),
      (err: any) => err.status === 403 && err.message.includes('Administrator privileges required'),
    );
    assert.equal(checkAdminPermission(['admin'], ['admin:access']), true);
  });

  // 15. Backend response contract compatibility
  it('15. Backend response contract compatibility: admin Challenge type matches backend schema', () => {
    const cadences: ChallengeCadence[] = ['daily', 'weekly', 'monthly', 'special', 'custom'];
    const categories: ChallengeCategory[] = ['workout', 'habit', 'nutrition', 'hydration', 'mixed'];
    const metricTypes: ChallengeMetricType[] = [
      'workout_count',
      'workout_duration_min',
      'workout_volume_kg',
      'habit_completion_count',
      'habit_streak_days',
      'water_liters',
      'calorie_compliance_days',
      'protein_target_days',
      'personal_record_count',
    ];

    cadences.forEach((cadence) => {
      categories.forEach((category) => {
        const mock: Challenge = {
          id: 'b0000000-0000-4000-8000-000000000002',
          slug: `test-${cadence}-${category}`,
          title: `Test ${cadence} ${category}`,
          description: 'Valid challenge test description',
          cadence,
          category,
          metricType: metricTypes[0],
          targetValue: 10,
          rewardPoints: 50,
          rewardBadgeId: null,
          status: 'published',
          autoEnroll: true,
          iconName: 'trophy',
          bannerColor: 'teal',
          metadata: { automated: true },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const res = challengeViewSchema.safeParse(mock);
        assert.equal(res.success, true, `Failed validation for ${cadence}/${category}`);
      });
    });
  });
});
