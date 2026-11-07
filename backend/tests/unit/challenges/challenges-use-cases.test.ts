import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Challenge } from '../../../src/modules/challenges/domain/challenge.js';
import { ChallengeOccurrence } from '../../../src/modules/challenges/domain/challenge-occurrence.js';
import { ChallengeEnrollment } from '../../../src/modules/challenges/domain/challenge-enrollment.js';
import { Badge } from '../../../src/modules/challenges/domain/badge.js';
import { UserBadge } from '../../../src/modules/challenges/domain/user-badge.js';
import { GamificationProfile } from '../../../src/modules/challenges/domain/gamification-profile.js';
import { PointsLedgerEntry } from '../../../src/modules/challenges/domain/points-ledger.js';
import { calculateLevel } from '../../../src/modules/challenges/domain/level-calculator.js';
import {
  DuplicateEnrollmentError,
  IneligibleForRewardError,
  OccurrenceClosedError,
  RewardAlreadyClaimedError,
} from '../../../src/modules/challenges/domain/errors.js';
import { ChallengeEvaluatorService } from '../../../src/modules/challenges/application/services/challenge-evaluator.js';
import { ListActiveChallengesUseCase } from '../../../src/modules/challenges/application/use-cases/list-active-challenges.js';
import { EnrollChallengeUseCase } from '../../../src/modules/challenges/application/use-cases/enroll-challenge.js';
import { EvaluateChallengeProgressUseCase } from '../../../src/modules/challenges/application/use-cases/evaluate-challenge-progress.js';
import { ClaimChallengeRewardUseCase } from '../../../src/modules/challenges/application/use-cases/claim-challenge-reward.js';
import { EvaluateMilestonesAndBadgesUseCase } from '../../../src/modules/challenges/application/use-cases/evaluate-milestones-and-badges.js';
import { GetGamificationSummaryUseCase } from '../../../src/modules/challenges/application/use-cases/get-gamification-summary.js';
import { AdminCreateChallengeUseCase } from '../../../src/modules/challenges/application/use-cases/admin-create-challenge.js';
import { AdminUpdateChallengeUseCase } from '../../../src/modules/challenges/application/use-cases/admin-update-challenge.js';
import {
  AdminPublishChallengeUseCase,
  AdminArchiveChallengeUseCase,
} from '../../../src/modules/challenges/application/use-cases/admin-status-challenge.js';
import type {
  IChallengeRepository,
  IChallengeOccurrenceRepository,
  IChallengeEnrollmentRepository,
  IBadgeRepository,
  IUserBadgeRepository,
  IGamificationProfileRepository,
  IGamificationPointsLedgerRepository,
  IGamificationRewardPort,
  IGamificationTelemetryPort,
} from '../../../src/modules/challenges/application/ports.js';

describe('Challenges & Gamification Application Use Cases', () => {
  let challengeRepo: IChallengeRepository;
  let occurrenceRepo: IChallengeOccurrenceRepository;
  let enrollmentRepo: IChallengeEnrollmentRepository;
  let badgeRepo: IBadgeRepository;
  let userBadgeRepo: IUserBadgeRepository;
  let profileRepo: IGamificationProfileRepository;
  let ledgerRepo: IGamificationPointsLedgerRepository;
  let rewardPort: IGamificationRewardPort;
  let telemetryPort: IGamificationTelemetryPort;
  let evaluatorService: ChallengeEvaluatorService;

  // In-memory test state fixtures
  let challengesMap: Map<string, Challenge>;
  let occurrencesMap: Map<string, ChallengeOccurrence>;
  let enrollmentsMap: Map<string, ChallengeEnrollment>;
  let badgesMap: Map<string, Badge>;
  let userBadgesList: UserBadge[];
  let profilesMap: Map<string, GamificationProfile>;
  let ledgerList: PointsLedgerEntry[];

  const USER_A = 'u1111111-1111-1111-1111-111111111111';
  const USER_B = 'u2222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    challengesMap = new Map();
    occurrencesMap = new Map();
    enrollmentsMap = new Map();
    badgesMap = new Map();
    userBadgesList = [];
    profilesMap = new Map();
    ledgerList = [];

    challengeRepo = {
      findById: vi.fn(async (id: string) => challengesMap.get(id) ?? null),
      findBySlug: vi.fn(async (slug: string) => {
        for (const c of challengesMap.values()) {
          if (c.slug === slug && c.deletedAt === null) return c;
        }
        return null;
      }),
      listPublished: vi.fn(async () => {
        return Array.from(challengesMap.values()).filter(
          (c) => c.status === 'published' && c.deletedAt === null,
        );
      }),
      listAll: vi.fn(async (opts) => {
        let list = Array.from(challengesMap.values()).filter((c) => c.deletedAt === null);
        if (opts?.cadence) list = list.filter((c) => c.cadence === opts.cadence);
        if (opts?.status) list = list.filter((c) => c.status === opts.status);
        return list;
      }),
      save: vi.fn(async (c: Challenge) => {
        challengesMap.set(c.id, c);
      }),
      softDelete: vi.fn(async (id: string) => {
        const c = challengesMap.get(id);
        if (c) {
          challengesMap.set(id, new Challenge({ ...c, deletedAt: new Date() }));
        }
      }),
    };

    occurrenceRepo = {
      findById: vi.fn(async (id: string) => occurrencesMap.get(id) ?? null),
      findByChallengeAndStart: vi.fn(async (cid: string, start: Date) => {
        for (const o of occurrencesMap.values()) {
          if (o.challengeId === cid && o.periodStart.getTime() === start.getTime()) return o;
        }
        return null;
      }),
      findByChallengeAndKey: vi.fn(async (cid: string, key: string) => {
        for (const o of occurrencesMap.values()) {
          if (o.challengeId === cid && o.occurrenceKey === key) return o;
        }
        return null;
      }),
      listActiveForPeriod: vi.fn(async () => Array.from(occurrencesMap.values())),
      listByChallenge: vi.fn(async (cid: string) => {
        return Array.from(occurrencesMap.values()).filter((o) => o.challengeId === cid);
      }),
      findOrCreate: vi.fn(async (o: ChallengeOccurrence) => {
        for (const existing of occurrencesMap.values()) {
          if (existing.challengeId === o.challengeId && existing.occurrenceKey === o.occurrenceKey) {
            return existing;
          }
        }
        occurrencesMap.set(o.id, o);
        return o;
      }),
      updateStatus: vi.fn(async (id, status) => {
        const o = occurrencesMap.get(id);
        if (o) {
          occurrencesMap.set(id, new ChallengeOccurrence({ ...o, status }));
        }
      }),
    };

    enrollmentRepo = {
      findById: vi.fn(async (id: string) => enrollmentsMap.get(id) ?? null),
      findByUserAndOccurrence: vi.fn(async (uid: string, oid: string) => {
        const key = `${uid}:${oid}`;
        return enrollmentsMap.get(key) ?? null;
      }),
      listByUser: vi.fn(async (uid: string, status) => {
        let list = Array.from(enrollmentsMap.values()).filter((e) => e.userId === uid);
        if (status) list = list.filter((e) => e.status === status);
        return list;
      }),
      listByOccurrence: vi.fn(async (oid: string) => {
        return Array.from(enrollmentsMap.values()).filter((e) => e.occurrenceId === oid);
      }),
      enroll: vi.fn(async (e: ChallengeEnrollment) => {
        const key = `${e.userId}:${e.occurrenceId}`;
        enrollmentsMap.set(key, e);
        return e;
      }),
      save: vi.fn(async (e: ChallengeEnrollment) => {
        const key = `${e.userId}:${e.occurrenceId}`;
        enrollmentsMap.set(key, e);
      }),
    };

    badgeRepo = {
      findById: vi.fn(async (id: string) => badgesMap.get(id) ?? null),
      findBySlug: vi.fn(async (slug: string) => {
        for (const b of badgesMap.values()) {
          if (b.slug === slug) return b;
        }
        return null;
      }),
      listActive: vi.fn(async () => Array.from(badgesMap.values()).filter((b) => b.isActive)),
      save: vi.fn(async (b: Badge) => {
        badgesMap.set(b.id, b);
      }),
    };

    userBadgeRepo = {
      listByUser: vi.fn(async (uid: string) => userBadgesList.filter((ub) => ub.userId === uid)),
      hasBadge: vi.fn(async (uid: string, bid: string) =>
        userBadgesList.some((ub) => ub.userId === uid && ub.badgeId === bid),
      ),
      awardBadge: vi.fn(async (ub: UserBadge) => {
        const exists = userBadgesList.some((x) => x.userId === ub.userId && x.badgeId === ub.badgeId);
        if (exists) return false;
        userBadgesList.push(ub);
        return true;
      }),
    };

    profileRepo = {
      findByUserId: vi.fn(async (uid: string) => profilesMap.get(uid) ?? null),
      save: vi.fn(async (p: GamificationProfile) => {
        profilesMap.set(p.userId, p);
      }),
    };

    ledgerRepo = {
      recordPoints: vi.fn(async (entry: PointsLedgerEntry) => {
        const exists = ledgerList.some(
          (l) =>
            l.userId === entry.userId && l.sourceType === entry.sourceType && l.sourceId === entry.sourceId,
        );
        if (exists) return false;
        ledgerList.push(entry);
        return true;
      }),
      listByUser: vi.fn(async (uid: string) => ledgerList.filter((l) => l.userId === uid)),
      getTotalPoints: vi.fn(async (uid: string) => {
        return ledgerList.filter((l) => l.userId === uid).reduce((sum, l) => sum + l.points, 0);
      }),
    };

    rewardPort = {
      executeAtomicRewardClaim: vi.fn(async (input) => {
        const key = `${input.userId}:${input.occurrenceId}`;
        const enrollment = enrollmentsMap.get(key);
        if (!enrollment) {
          throw new IneligibleForRewardError('Not enrolled');
        }
        if (enrollment.isClaimed()) {
          throw new RewardAlreadyClaimedError(input.occurrenceId);
        }
        enrollment.markClaimed();

        // Ledger
        ledgerList.push(
          new PointsLedgerEntry({
            id: 'l-new',
            userId: input.userId,
            points: input.points,
            sourceType: 'challenge',
            sourceId: input.occurrenceId,
            description: input.description,
            createdAt: new Date(),
          }),
        );

        // Badge
        let badgeAwarded = false;
        if (input.badgeId) {
          const has = userBadgesList.some((b) => b.userId === input.userId && b.badgeId === input.badgeId);
          if (!has) {
            userBadgesList.push(
              new UserBadge({
                id: 'ub-new',
                userId: input.userId,
                badgeId: input.badgeId,
                earnedAt: new Date(),
                triggerType: 'challenge',
                triggerId: input.occurrenceId,
              }),
            );
            badgeAwarded = true;
          }
        }

        // Profile update
        const existingProf = profilesMap.get(input.userId);
        const totalPoints = (existingProf ? existingProf.totalPoints : 0) + input.points;
        const levelInfo = calculateLevel(totalPoints);
        const newProf = new GamificationProfile({
          userId: input.userId,
          totalPoints,
          currentLevel: levelInfo.level,
          badgesCount: (existingProf ? existingProf.badgesCount : 0) + (badgeAwarded ? 1 : 0),
          challengesWon: (existingProf ? existingProf.challengesWon : 0) + 1,
          updatedAt: new Date(),
        });
        profilesMap.set(input.userId, newProf);

        return {
          claimed: true,
          pointsAwarded: input.points,
          badgeAwarded,
          newTotalPoints: totalPoints,
          newLevel: newProf.currentLevel,
        };
      }),
    };

    telemetryPort = {
      getWorkoutCount: vi.fn().mockResolvedValue(0),
      getWorkoutDurationMinutes: vi.fn().mockResolvedValue(0),
      getWorkoutVolumeKg: vi.fn().mockResolvedValue(0),
      getHabitCompletionsCount: vi.fn().mockResolvedValue(0),
      getMaxHabitStreak: vi.fn().mockResolvedValue(0),
      getWaterLiters: vi.fn().mockResolvedValue(0),
      getCalorieTargetHitDays: vi.fn().mockResolvedValue(0),
      getProteinTargetHitDays: vi.fn().mockResolvedValue(0),
      getPersonalRecordsCount: vi.fn().mockResolvedValue(0),
      getWeightLossKg: vi.fn().mockResolvedValue(0),
      getTotalWorkoutCount: vi.fn().mockResolvedValue(0),
    };

    evaluatorService = new ChallengeEvaluatorService(telemetryPort);
  });

  describe('ListActiveChallengesUseCase & Auto-Enrollment', () => {
    it('lists published challenges and auto-enrolls user when autoEnroll=true', async () => {
      const challenge = new Challenge({
        id: 'c-1',
        slug: 'daily_workout',
        title: 'Daily Workout',
        description: 'Complete 1 workout',
        cadence: 'daily',
        category: 'workout',
        metricType: 'workout_count',
        targetValue: 1,
        rewardPoints: 50,
        status: 'published',
        autoEnroll: true,
        iconName: 'dumbbell',
        bannerColor: 'teal',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      // Mock telemetry: user completed 1 workout
      (telemetryPort.getWorkoutCount as any).mockResolvedValue(1);

      const useCase = new ListActiveChallengesUseCase(
        challengeRepo,
        occurrenceRepo,
        enrollmentRepo,
        evaluatorService,
      );

      const res = await useCase.execute({ userId: USER_A });
      expect(res.challenges.length).toBe(1);
      const item = res.challenges[0]!;
      expect(item.enrolled).toBe(true);
      expect(item.enrollment).not.toBeNull();
      expect(item.enrollment?.currentProgress).toBe(1);
      expect(item.enrollment?.status).toBe('completed');
      expect(item.canClaim).toBe(true);
    });

    it('does not auto-enroll user when challenge autoEnroll=false', async () => {
      const challenge = new Challenge({
        id: 'c-opt-in',
        slug: 'marathon_prep',
        title: 'Marathon Prep',
        description: 'Run 10km volume',
        cadence: 'weekly',
        category: 'workout',
        metricType: 'workout_volume_kg',
        targetValue: 10000,
        rewardPoints: 200,
        status: 'published',
        autoEnroll: false, // Opt-in
        iconName: 'footprints',
        bannerColor: 'orange',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const useCase = new ListActiveChallengesUseCase(
        challengeRepo,
        occurrenceRepo,
        enrollmentRepo,
        evaluatorService,
      );

      const res = await useCase.execute({ userId: USER_A });
      expect(res.challenges.length).toBe(1);
      const item = res.challenges[0]!;
      expect(item.enrolled).toBe(false);
      expect(item.enrollment).toBeNull();
      expect(item.canClaim).toBe(false);
    });
  });

  describe('EnrollChallengeUseCase', () => {
    it('manually enrolls user into an opt-in challenge occurrence', async () => {
      const challenge = new Challenge({
        id: 'c-2',
        slug: 'opt_in_challenge',
        title: 'Special Challenge',
        description: 'Complete 5 habits',
        cadence: 'weekly',
        category: 'habit',
        metricType: 'habit_completion_count',
        targetValue: 5,
        rewardPoints: 100,
        status: 'published',
        autoEnroll: false,
        iconName: 'zap',
        bannerColor: 'blue',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const occurrence = new ChallengeOccurrence({
        id: 'occ-2',
        challengeId: challenge.id,
        occurrenceKey: 'weekly-2026-W45',
        periodStart: new Date(Date.now() - 3600000),
        periodEnd: new Date(Date.now() + 86400000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(occurrence.id, occurrence);

      const useCase = new EnrollChallengeUseCase(challengeRepo, occurrenceRepo, enrollmentRepo);
      const result = await useCase.execute({ userId: USER_A, occurrenceId: occurrence.id });

      expect(result.enrollment.challengeId).toBe(challenge.id);
      expect(result.enrollment.userId).toBe(USER_A);
      expect(result.enrollment.status).toBe('in_progress');

      // Duplicate enrollment attempt
      await expect(useCase.execute({ userId: USER_A, occurrenceId: occurrence.id })).rejects.toThrow(
        DuplicateEnrollmentError,
      );
    });

    it('rejects enrollment into closed or expired occurrences', async () => {
      const challenge = new Challenge({
        id: 'c-3',
        slug: 'expired_test',
        title: 'Expired Challenge',
        description: 'Old occurrence',
        cadence: 'daily',
        category: 'hydration',
        metricType: 'water_liters',
        targetValue: 2,
        rewardPoints: 20,
        status: 'published',
        autoEnroll: false,
        iconName: 'droplet',
        bannerColor: 'sky',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      // Occurrence that ended yesterday
      const expiredOcc = new ChallengeOccurrence({
        id: 'occ-expired',
        challengeId: challenge.id,
        occurrenceKey: 'daily-2026-11-05',
        periodStart: new Date(Date.now() - 2 * 86400000),
        periodEnd: new Date(Date.now() - 86400000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(expiredOcc.id, expiredOcc);

      const useCase = new EnrollChallengeUseCase(challengeRepo, occurrenceRepo, enrollmentRepo);
      await expect(useCase.execute({ userId: USER_A, occurrenceId: expiredOcc.id })).rejects.toThrow(
        OccurrenceClosedError,
      );
    });
  });

  describe('EvaluateChallengeProgressUseCase & Deterministic Metrics', () => {
    it('evaluates water liters and updates progress accurately', async () => {
      const challenge = new Challenge({
        id: 'c-water',
        slug: 'daily_water',
        title: 'Hydration Target',
        description: 'Drink 3L of water',
        cadence: 'daily',
        category: 'hydration',
        metricType: 'water_liters',
        targetValue: 3.0,
        rewardPoints: 30,
        status: 'published',
        autoEnroll: true,
        iconName: 'droplet',
        bannerColor: 'sky',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const occurrence = new ChallengeOccurrence({
        id: 'occ-water',
        challengeId: challenge.id,
        occurrenceKey: 'daily-2026-11-06',
        periodStart: new Date(Date.now() - 3600000),
        periodEnd: new Date(Date.now() + 3600000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(occurrence.id, occurrence);

      const enrollment = new ChallengeEnrollment({
        id: 'enr-water',
        userId: USER_A,
        occurrenceId: occurrence.id,
        challengeId: challenge.id,
        status: 'in_progress',
        currentProgress: 1.0,
        targetValue: 3.0,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      enrollmentsMap.set(`${USER_A}:${occurrence.id}`, enrollment);

      // Telemetry port reports 2.5L logged
      (telemetryPort.getWaterLiters as any).mockResolvedValue(2.5);

      const useCase = new EvaluateChallengeProgressUseCase(
        challengeRepo,
        occurrenceRepo,
        enrollmentRepo,
        evaluatorService,
      );

      const res = await useCase.execute({ userId: USER_A, occurrenceId: occurrence.id });
      expect(res.enrollments[0]?.currentProgress).toBe(2.5);
      expect(res.enrollments[0]?.progressRatio).toBeCloseTo(2.5 / 3.0, 3);
      expect(res.enrollments[0]?.status).toBe('in_progress');

      // Now telemetry hits 3.0L -> completed
      (telemetryPort.getWaterLiters as any).mockResolvedValue(3.2);
      const res2 = await useCase.execute({ userId: USER_A, occurrenceId: occurrence.id });
      expect(res2.enrollments[0]?.currentProgress).toBe(3.2);
      expect(res2.enrollments[0]?.progressRatio).toBe(1.0);
      expect(res2.enrollments[0]?.status).toBe('completed');
    });

    it('isolates user progress between different users', async () => {
      const challenge = new Challenge({
        id: 'c-streak',
        slug: 'streak_challenge',
        title: 'Habit Streak',
        description: 'Reach 5-day habit streak',
        cadence: 'weekly',
        category: 'habit',
        metricType: 'habit_streak_days',
        targetValue: 5,
        rewardPoints: 50,
        status: 'published',
        autoEnroll: true,
        iconName: 'flame',
        bannerColor: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const occurrence = new ChallengeOccurrence({
        id: 'occ-streak',
        challengeId: challenge.id,
        occurrenceKey: 'weekly-2026-W45',
        periodStart: new Date(Date.now() - 3600000),
        periodEnd: new Date(Date.now() + 3600000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(occurrence.id, occurrence);

      // User A enrollment: 4 days streak
      const enrA = new ChallengeEnrollment({
        id: 'enr-A',
        userId: USER_A,
        occurrenceId: occurrence.id,
        challengeId: challenge.id,
        status: 'in_progress',
        currentProgress: 0,
        targetValue: 5,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      enrollmentsMap.set(`${USER_A}:${occurrence.id}`, enrA);

      // User B enrollment: 1 day streak
      const enrB = new ChallengeEnrollment({
        id: 'enr-B',
        userId: USER_B,
        occurrenceId: occurrence.id,
        challengeId: challenge.id,
        status: 'in_progress',
        currentProgress: 0,
        targetValue: 5,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      enrollmentsMap.set(`${USER_B}:${occurrence.id}`, enrB);

      (telemetryPort.getMaxHabitStreak as any).mockImplementation(async (uid: string) => {
        return uid === USER_A ? 4 : 1;
      });

      const useCase = new EvaluateChallengeProgressUseCase(
        challengeRepo,
        occurrenceRepo,
        enrollmentRepo,
        evaluatorService,
      );

      await useCase.execute({ userId: USER_A, occurrenceId: occurrence.id });
      await useCase.execute({ userId: USER_B, occurrenceId: occurrence.id });

      expect(enrollmentsMap.get(`${USER_A}:${occurrence.id}`)?.currentProgress).toBe(4);
      expect(enrollmentsMap.get(`${USER_B}:${occurrence.id}`)?.currentProgress).toBe(1);
    });
  });

  describe('ClaimChallengeRewardUseCase & Secure Verification', () => {
    it('verifies telemetry before claiming and throws if progress is incomplete', async () => {
      const challenge = new Challenge({
        id: 'c-claim',
        slug: 'claim_test',
        title: 'Workout Challenge',
        description: 'Complete 3 workouts',
        cadence: 'weekly',
        category: 'workout',
        metricType: 'workout_count',
        targetValue: 3,
        rewardPoints: 100,
        status: 'published',
        autoEnroll: true,
        iconName: 'dumbbell',
        bannerColor: 'teal',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const occurrence = new ChallengeOccurrence({
        id: 'occ-claim',
        challengeId: challenge.id,
        occurrenceKey: 'weekly-2026-W45',
        periodStart: new Date(Date.now() - 3600000),
        periodEnd: new Date(Date.now() + 86400000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(occurrence.id, occurrence);

      const enrollment = new ChallengeEnrollment({
        id: 'enr-claim',
        userId: USER_A,
        occurrenceId: occurrence.id,
        challengeId: challenge.id,
        status: 'in_progress',
        currentProgress: 1, // Only 1 completed
        targetValue: 3,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      enrollmentsMap.set(`${USER_A}:${occurrence.id}`, enrollment);

      // Server queries real telemetry: returns 2 (still below 3)
      (telemetryPort.getWorkoutCount as any).mockResolvedValue(2);

      const useCase = new ClaimChallengeRewardUseCase(
        challengeRepo,
        occurrenceRepo,
        enrollmentRepo,
        rewardPort,
        evaluatorService,
      );

      await expect(useCase.execute({ userId: USER_A, occurrenceId: occurrence.id })).rejects.toThrow(
        IneligibleForRewardError,
      );
    });

    it('successfully claims reward when verified telemetry meets target', async () => {
      const badge = new Badge({
        id: 'b-champ',
        slug: 'workout_champ',
        name: 'Workout Champion',
        description: '3 workouts done',
        category: 'workout',
        tier: 'silver',
        iconName: 'trophy',
        pointsValue: 50,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      badgesMap.set(badge.id, badge);

      const challenge = new Challenge({
        id: 'c-claim-ok',
        slug: 'claim_test_ok',
        title: 'Workout Challenge 3',
        description: 'Complete 3 workouts',
        cadence: 'weekly',
        category: 'workout',
        metricType: 'workout_count',
        targetValue: 3,
        rewardPoints: 100,
        rewardBadgeId: badge.id,
        status: 'published',
        autoEnroll: true,
        iconName: 'dumbbell',
        bannerColor: 'teal',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const occurrence = new ChallengeOccurrence({
        id: 'occ-claim-ok',
        challengeId: challenge.id,
        occurrenceKey: 'weekly-2026-W45',
        periodStart: new Date(Date.now() - 3600000),
        periodEnd: new Date(Date.now() + 86400000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(occurrence.id, occurrence);

      const enrollment = new ChallengeEnrollment({
        id: 'enr-claim-ok',
        userId: USER_A,
        occurrenceId: occurrence.id,
        challengeId: challenge.id,
        status: 'in_progress',
        currentProgress: 0,
        targetValue: 3,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      enrollmentsMap.set(`${USER_A}:${occurrence.id}`, enrollment);

      // Verified telemetry meets target
      (telemetryPort.getWorkoutCount as any).mockResolvedValue(3);

      const useCase = new ClaimChallengeRewardUseCase(
        challengeRepo,
        occurrenceRepo,
        enrollmentRepo,
        rewardPort,
        evaluatorService,
      );

      const result = await useCase.execute({ userId: USER_A, occurrenceId: occurrence.id });
      expect(result.claimed).toBe(true);
      expect(result.pointsAwarded).toBe(100);
      expect(result.badgeAwarded).toBe(true);
      expect(result.newTotalPoints).toBe(100);
      expect(result.newLevel).toBe(2); // Level 2 starts at 100 points!

      // Second claim attempt should fail
      await expect(useCase.execute({ userId: USER_A, occurrenceId: occurrence.id })).rejects.toThrow(
        RewardAlreadyClaimedError,
      );
    });

    it('enforces 7-day claim grace period', async () => {
      const challenge = new Challenge({
        id: 'c-grace',
        slug: 'grace_test',
        title: 'Grace Challenge',
        description: 'Test',
        cadence: 'daily',
        category: 'workout',
        metricType: 'workout_count',
        targetValue: 1,
        rewardPoints: 50,
        status: 'published',
        autoEnroll: true,
        iconName: 'dumbbell',
        bannerColor: 'teal',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      // Occurrence that ended 8 days ago
      const expiredOcc = new ChallengeOccurrence({
        id: 'occ-grace-expired',
        challengeId: challenge.id,
        occurrenceKey: 'daily-2026-10-28',
        periodStart: new Date(Date.now() - 9 * 86400000),
        periodEnd: new Date(Date.now() - 8 * 86400000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(expiredOcc.id, expiredOcc);

      const enrollment = new ChallengeEnrollment({
        id: 'enr-grace',
        userId: USER_A,
        occurrenceId: expiredOcc.id,
        challengeId: challenge.id,
        status: 'completed',
        currentProgress: 1,
        targetValue: 1,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      enrollmentsMap.set(`${USER_A}:${expiredOcc.id}`, enrollment);

      (telemetryPort.getWorkoutCount as any).mockResolvedValue(1);

      const useCase = new ClaimChallengeRewardUseCase(
        challengeRepo,
        occurrenceRepo,
        enrollmentRepo,
        rewardPort,
        evaluatorService,
      );

      await expect(useCase.execute({ userId: USER_A, occurrenceId: expiredOcc.id })).rejects.toThrow(
        OccurrenceClosedError,
      );
    });
  });

  describe('EvaluateMilestonesAndBadgesUseCase', () => {
    it('evaluates and awards PR, consistency, and weight loss milestone badges', async () => {
      const b1 = new Badge({
        id: 'b-pr',
        slug: 'strength_pr_first',
        name: 'First PR Broken',
        description: 'First strength PR',
        category: 'strength',
        tier: 'bronze',
        iconName: 'trophy',
        pointsValue: 50,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const b2 = new Badge({
        id: 'b-cons',
        slug: 'workout_consistency_16',
        name: 'Consistency Champion',
        description: '16 workouts in month',
        category: 'workout',
        tier: 'silver',
        iconName: 'flame',
        pointsValue: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const b3 = new Badge({
        id: 'b-100',
        slug: 'workout_century_100',
        name: 'Century Club',
        description: '100 total workouts',
        category: 'workout',
        tier: 'platinum',
        iconName: 'crown',
        pointsValue: 500,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      badgesMap.set(b1.id, b1);
      badgesMap.set(b2.id, b2);
      badgesMap.set(b3.id, b3);

      // User has 1 PR, 18 workouts in last 30 days, but only 45 lifetime workouts
      (telemetryPort.getPersonalRecordsCount as any).mockResolvedValue(1);
      (telemetryPort.getWorkoutCount as any).mockResolvedValue(18);
      (telemetryPort.getTotalWorkoutCount as any).mockResolvedValue(45);

      const useCase = new EvaluateMilestonesAndBadgesUseCase(
        badgeRepo,
        userBadgeRepo,
        ledgerRepo,
        profileRepo,
        telemetryPort,
      );

      const result = await useCase.execute({ userId: USER_A });
      expect(result.newlyUnlockedBadges.length).toBe(2);
      expect(result.newlyUnlockedBadges.map((b) => b.slug)).toContain('strength_pr_first');
      expect(result.newlyUnlockedBadges.map((b) => b.slug)).toContain('workout_consistency_16');
      expect(result.newlyUnlockedBadges.map((b) => b.slug)).not.toContain('workout_century_100');

      // Subsequent evaluation should not re-unlock already earned badges
      const secondRun = await useCase.execute({ userId: USER_A });
      expect(secondRun.newlyUnlockedBadges.length).toBe(0);
    });
  });

  describe('GetGamificationSummaryUseCase', () => {
    it('returns user level and points accurately', async () => {
      const profile = new GamificationProfile({
        userId: USER_A,
        totalPoints: 350,
        currentLevel: 3,
        badgesCount: 2,
        challengesWon: 3,
        updatedAt: new Date(),
      });
      profilesMap.set(USER_A, profile);

      const useCase = new GetGamificationSummaryUseCase(profileRepo, ledgerRepo, userBadgeRepo);
      const res = await useCase.execute({ userId: USER_A });

      expect(res.profile.userId).toBe(USER_A);
      expect(res.profile.totalPoints).toBe(350);
      expect(res.profile.currentLevel).toBe(3);
      expect(res.profile.levelTitle).toBe('Consistent');
      expect(res.profile.currentLevelMinPoints).toBe(250);
      expect(res.profile.nextLevelMinPoints).toBe(500);
      expect(res.profile.pointsToNextLevel).toBe(150);
      expect(res.profile.levelProgressRatio).toBeCloseTo(100 / 250, 4);
    });
  });

  describe('Admin Challenge Use Cases', () => {
    it('creates a challenge and rejects duplicate slug or invalid targets', async () => {
      const useCase = new AdminCreateChallengeUseCase(challengeRepo);

      const res = await useCase.execute({
        slug: 'admin_test_1',
        title: 'Admin Challenge',
        description: 'Test',
        cadence: 'weekly',
        category: 'workout',
        metricType: 'workout_count',
        targetValue: 4,
        rewardPoints: 100,
      });

      expect(res.challenge.slug).toBe('admin_test_1');

      // Duplicate slug
      await expect(
        useCase.execute({
          slug: 'admin_test_1',
          title: 'Duplicate',
          description: 'Test',
          cadence: 'weekly',
          category: 'workout',
          metricType: 'workout_count',
          targetValue: 4,
          rewardPoints: 100,
        }),
      ).rejects.toThrow(/already exists/);

      // Target <= 0
      await expect(
        useCase.execute({
          slug: 'invalid_target',
          title: 'Invalid',
          description: 'Test',
          cadence: 'weekly',
          category: 'workout',
          metricType: 'workout_count',
          targetValue: 0,
          rewardPoints: 100,
        }),
      ).rejects.toThrow(/must be greater than 0/);
    });

    it('updates challenge and protects active in-progress challenges from unsafe target changes', async () => {
      const challenge = new Challenge({
        id: 'c-admin-upd',
        slug: 'upd_challenge',
        title: 'Original Title',
        description: 'Original Desc',
        cadence: 'weekly',
        category: 'workout',
        metricType: 'workout_count',
        targetValue: 4,
        rewardPoints: 80,
        status: 'published',
        autoEnroll: true,
        iconName: 'dumbbell',
        bannerColor: 'teal',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const occ = new ChallengeOccurrence({
        id: 'occ-admin',
        challengeId: challenge.id,
        occurrenceKey: 'weekly-2026-W45',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 86400000),
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      occurrencesMap.set(occ.id, occ);

      // Active in-progress enrollment
      const enr = new ChallengeEnrollment({
        id: 'enr-in-prog',
        userId: USER_A,
        occurrenceId: occ.id,
        challengeId: challenge.id,
        status: 'in_progress',
        currentProgress: 2,
        targetValue: 4,
        lastEvaluatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      enrollmentsMap.set(`${USER_A}:${occ.id}`, enr);

      const useCase = new AdminUpdateChallengeUseCase(challengeRepo, occurrenceRepo, enrollmentRepo);

      // Unsafe target modification while enrollments are in progress
      await expect(useCase.execute({ id: challenge.id, targetValue: 10 })).rejects.toThrow(
        /Cannot modify target value of a challenge with active in-progress enrollments/,
      );

      // Safe update (changing title and description)
      const updatedRes = await useCase.execute({
        id: challenge.id,
        title: 'New Improved Title',
      });
      expect(updatedRes.challenge.title).toBe('New Improved Title');
    });

    it('archives and publishes challenges correctly', async () => {
      const challenge = new Challenge({
        id: 'c-status',
        slug: 'status_test',
        title: 'Status Test',
        description: 'Desc',
        cadence: 'daily',
        category: 'hydration',
        metricType: 'water_liters',
        targetValue: 2,
        rewardPoints: 20,
        status: 'draft',
        autoEnroll: true,
        iconName: 'droplet',
        bannerColor: 'sky',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      challengesMap.set(challenge.id, challenge);

      const publishUseCase = new AdminPublishChallengeUseCase(challengeRepo);
      const pubRes = await publishUseCase.execute({ id: challenge.id });
      expect(pubRes.challenge.status).toBe('published');

      const archiveUseCase = new AdminArchiveChallengeUseCase(challengeRepo);
      const archRes = await archiveUseCase.execute({ id: challenge.id });
      expect(archRes.challenge.status).toBe('archived');
    });
  });
});
