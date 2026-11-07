import { describe, it, expect } from 'vitest';
import {
  calculateEstimated1rm,
  calculateWorkoutFrequency,
  calculateTrainingVolume,
  calculateWorkoutDuration,
  calculateWorkoutConsistency,
  buildExerciseProgression,
  summarizeWorkoutAnalytics,
  type RawWorkoutSessionRecord,
  type RawExerciseSetRecord,
} from '../../../src/modules/analytics/domain/workout-metrics.js';
import { createCalendarBuckets } from '../../../src/modules/analytics/domain/analytics-period.js';

describe('Workout Metrics & Calculation Engine', () => {
  describe('calculateEstimated1rm', () => {
    it('returns exact weight for 1 rep max', () => {
      expect(calculateEstimated1rm(100, 1)).toBe(100);
      expect(calculateEstimated1rm(82.5, 1)).toBe(82.5);
    });

    it('calculates e1RM accurately using Epley formula for reps > 1', () => {
      // 100 kg for 5 reps: 100 * (1 + 5/30) = 100 * 1.166667 = 116.7 kg
      expect(calculateEstimated1rm(100, 5)).toBe(116.7);
      // 80 kg for 10 reps: 80 * (1 + 10/30) = 80 * 1.333333 = 106.7 kg
      expect(calculateEstimated1rm(80, 10)).toBe(106.7);
    });

    it('safely guards against 0 or negative weight/reps', () => {
      expect(calculateEstimated1rm(0, 5)).toBe(0);
      expect(calculateEstimated1rm(100, 0)).toBe(0);
      expect(calculateEstimated1rm(-50, 5)).toBe(0);
      expect(calculateEstimated1rm(100, -2)).toBe(0);
    });
  });

  describe('calculateWorkoutFrequency and Volume and Duration', () => {
    const fixedNow = new Date('2026-10-09T18:00:00.000Z');
    const buckets = createCalendarBuckets('M', fixedNow, 'UTC'); // 4 weekly buckets

    const sessions: RawWorkoutSessionRecord[] = [
      {
        id: 's-1',
        workoutName: 'Upper Body A',
        startedAt: new Date(buckets[3]!.startDate.getTime() + 3600000), // This wk
        completedAt: new Date(buckets[3]!.startDate.getTime() + 7200000),
        durationSeconds: 3600, // 60 min
        totalVolumeKg: 12000,
        totalSets: 15,
        totalReps: 120,
        isCompleted: true,
      },
      {
        id: 's-2',
        workoutName: 'Lower Body A',
        startedAt: new Date(buckets[3]!.startDate.getTime() + 86400000), // This wk
        completedAt: new Date(buckets[3]!.startDate.getTime() + 90000000),
        durationSeconds: 2700, // 45 min
        totalVolumeKg: 18000,
        totalSets: 16,
        totalReps: 100,
        isCompleted: true,
      },
      {
        id: 's-3',
        workoutName: 'Abandoned Workout',
        startedAt: new Date(buckets[3]!.startDate.getTime() + 100000000),
        completedAt: new Date(buckets[3]!.startDate.getTime() + 101000000),
        durationSeconds: 600,
        totalVolumeKg: 1000,
        totalSets: 2,
        totalReps: 20,
        isCompleted: false, // NOT completed -> should be excluded!
      },
      {
        id: 's-4',
        workoutName: 'Full Body',
        startedAt: new Date(buckets[2]!.startDate.getTime() + 3600000), // W-1
        completedAt: new Date(buckets[2]!.startDate.getTime() + 6600000),
        durationSeconds: 3000, // 50 min
        totalVolumeKg: 15000,
        totalSets: 14,
        totalReps: 110,
        isCompleted: true,
      },
    ];

    it('aggregates frequency excluding incomplete workouts', () => {
      const frequency = calculateWorkoutFrequency(sessions, buckets);
      expect(frequency).toHaveLength(4);
      expect(frequency[3]?.value).toBe(2); // s-1 and s-2, excluding s-3
      expect(frequency[2]?.value).toBe(1); // s-4
      expect(frequency[1]?.value).toBe(0); // W-2
      expect(frequency[0]?.value).toBe(0); // W-3
    });

    it('aggregates total volume per bucket', () => {
      const volume = calculateTrainingVolume(sessions, buckets);
      expect(volume).toHaveLength(4);
      expect(volume[3]?.value).toBe(30000); // 12000 + 18000
      expect(volume[2]?.value).toBe(15000); // 15000
      expect(volume[1]?.value).toBe(0);
    });

    it('aggregates average session duration in minutes per bucket', () => {
      const duration = calculateWorkoutDuration(sessions, buckets);
      expect(duration).toHaveLength(4);
      // This wk: (3600 + 2700) / 2 = 3150 sec = ~53 min
      expect(duration[3]?.value).toBe(53);
      expect(duration[2]?.value).toBe(50);
      expect(duration[1]?.value).toBe(0);
    });

    it('handles empty sessions safely with zero values', () => {
      const emptyFreq = calculateWorkoutFrequency([], buckets);
      expect(emptyFreq.every((p) => p.value === 0)).toBe(true);

      const emptyVol = calculateTrainingVolume([], buckets);
      expect(emptyVol.every((p) => p.value === 0)).toBe(true);

      const emptyDur = calculateWorkoutDuration([], buckets);
      expect(emptyDur.every((p) => p.value === 0)).toBe(true);
    });
  });

  describe('calculateWorkoutConsistency', () => {
    it('calculates percentage accurately against target days per week', () => {
      // 3 sessions completed with target 4 = 75%
      expect(calculateWorkoutConsistency(3, 4, 1)).toBe(75);
      // 4 sessions completed with target 4 = 100%
      expect(calculateWorkoutConsistency(4, 4, 1)).toBe(100);
      // 6 sessions completed with target 4 = capped at 100%
      expect(calculateWorkoutConsistency(6, 4, 1)).toBe(100);
    });

    it('defaults target to 3 days/week when target is null or zero', () => {
      // 3 completed with default 3 = 100%
      expect(calculateWorkoutConsistency(3, null, 1)).toBe(100);
      // 1 completed with default 3 = 33%
      expect(calculateWorkoutConsistency(1, 0, 1)).toBe(33);
    });

    it('scales correctly across multi-week windows', () => {
      // 8 sessions over 4 weeks with target 3/week (target = 12): 8/12 = 67%
      expect(calculateWorkoutConsistency(8, 3, 4)).toBe(67);
    });
  });

  describe('buildExerciseProgression', () => {
    const rawSets: RawExerciseSetRecord[] = [
      {
        setId: 'set-1',
        sessionId: 'session-1',
        exerciseId: 'bench-press',
        exerciseName: 'Barbell Bench Press',
        setNumber: 1,
        weightKg: 60,
        reps: 10,
        isWarmup: true, // Should be ignored!
        isPr: false,
        rpe: null,
        startedAt: new Date('2026-08-01T10:00:00Z'),
      },
      {
        setId: 'set-2',
        sessionId: 'session-1',
        exerciseId: 'bench-press',
        exerciseName: 'Barbell Bench Press',
        setNumber: 2,
        weightKg: 80,
        reps: 8, // e1rm = 80 * (1 + 8/30) = 101.3
        isWarmup: false,
        isPr: false,
        rpe: 8,
        startedAt: new Date('2026-08-01T10:05:00Z'),
      },
      {
        setId: 'set-3',
        sessionId: 'session-1',
        exerciseId: 'bench-press',
        exerciseName: 'Barbell Bench Press',
        setNumber: 3,
        weightKg: 85,
        reps: 5, // e1rm = 85 * (1 + 5/30) = 99.2 (lower than set 2!)
        isWarmup: false,
        isPr: false,
        rpe: 9,
        startedAt: new Date('2026-08-01T10:10:00Z'),
      },
      {
        setId: 'set-4',
        sessionId: 'session-2',
        exerciseId: 'bench-press',
        exerciseName: 'Barbell Bench Press',
        setNumber: 1,
        weightKg: 90,
        reps: 5, // e1rm = 90 * (1 + 5/30) = 105.0
        isWarmup: false,
        isPr: true,
        rpe: 9,
        startedAt: new Date('2026-08-15T10:00:00Z'),
      },
    ];

    it('extracts top set e1RM and calculates total session exercise volume', () => {
      const progression = buildExerciseProgression(rawSets);
      expect(progression).toHaveLength(2);

      // Session 1: set-2 had higher e1RM (101.3 kg) even though set-3 had higher absolute weight (85 kg)
      expect(progression[0]?.date).toBe('2026-08-01');
      expect(progression[0]?.topWeightKg).toBe(80);
      expect(progression[0]?.reps).toBe(8);
      expect(progression[0]?.estimated1rmKg).toBe(101.3);
      // Volume = 80*8 + 85*5 = 640 + 425 = 1065 kg (warmup excluded)
      expect(progression[0]?.volumeKg).toBe(1065);

      // Session 2:
      expect(progression[1]?.date).toBe('2026-08-15');
      expect(progression[1]?.topWeightKg).toBe(90);
      expect(progression[1]?.reps).toBe(5);
      expect(progression[1]?.estimated1rmKg).toBe(105);
      expect(progression[1]?.volumeKg).toBe(450);
    });

    it('returns empty array when sets array is empty', () => {
      expect(buildExerciseProgression([])).toEqual([]);
    });
  });

  describe('summarizeWorkoutAnalytics', () => {
    it('aggregates complete summary metrics accurately', () => {
      const fixedNow = new Date('2026-10-09T18:00:00.000Z');
      const buckets = createCalendarBuckets('M', fixedNow, 'UTC');

      const sessions: RawWorkoutSessionRecord[] = [
        {
          id: 's-1',
          workoutName: 'Push',
          startedAt: new Date(buckets[3]!.startDate.getTime() + 1000),
          completedAt: new Date(buckets[3]!.startDate.getTime() + 3601000),
          durationSeconds: 3600,
          totalVolumeKg: 15000,
          totalSets: 15,
          totalReps: 120,
          isCompleted: true,
        },
      ];

      const summary = summarizeWorkoutAnalytics(sessions, buckets, 3);
      expect(summary.totalSessions).toBe(1);
      expect(summary.totalVolumeKg).toBe(15000);
      expect(summary.totalDurationMinutes).toBe(60);
      expect(summary.avgDurationMin).toBe(60);
      expect(summary.frequencySeries).toHaveLength(4);
      expect(summary.volumeSeries).toHaveLength(4);
      expect(summary.durationSeries).toHaveLength(4);
    });
  });
});
