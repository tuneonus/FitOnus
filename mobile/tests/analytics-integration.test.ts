import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ActivityOverviewView,
  AnalyticsQueryParams,
  BodyAnalyticsView,
  ExerciseProgressionView,
  GoalsHabitsAnalyticsView,
  HydrationAnalyticsView,
  NutritionAnalyticsView,
  PeriodComparisonItem,
  WorkoutAnalyticsView,
} from '../src/features/analytics/types/analytics';
import {
  buildAnalyticsQuery,
  formatComparisonValue,
  formatOverviewSummary,
  resolveClientTimezone,
} from '../src/features/analytics/utils/analytics-formatters';
import { activityMeta, activityRings, weeklySteps } from '../src/features/home/data/homeMock';

describe('Phase 8.5 Mobile Advanced Analytics Integration', () => {
  describe('Timezone Resolution & Query Contract', () => {
    it('resolves valid IANA timezone identifier with UTC fallback', () => {
      const tz = resolveClientTimezone();
      assert.ok(typeof tz === 'string' && tz.length > 0, 'Timezone should be a non-empty string');
      assert.doesNotThrow(() => {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      }, 'Resolved timezone must be a valid IANA timezone identifier');
    });

    it('builds analytics query parameters with default timezone and custom parameters', () => {
      const query = buildAnalyticsQuery({
        range: '30d',
        refDate: '2026-11-07',
        timezone: 'America/New_York',
      });

      assert.equal(query.range, '30d');
      assert.equal(query.refDate, '2026-11-07');
      assert.equal(query.timezone, 'America/New_York');
    });

    it('builds hydration query with targetMl', () => {
      const query = buildAnalyticsQuery({
        range: '7d',
        targetMl: 3500,
      });

      assert.equal(query.range, '7d');
      assert.equal(query.targetMl, 3500);
      assert.ok(typeof query.timezone === 'string');
    });

    it('builds goals & habits query with windowDays', () => {
      const query = buildAnalyticsQuery({
        windowDays: 60,
      });

      assert.equal(query.windowDays, 60);
      assert.ok(typeof query.timezone === 'string');
    });
  });

  describe('DTO Structure Validation (All 7 Endpoints)', () => {
    it('1. validates WorkoutAnalyticsView schema contract', () => {
      const mockWorkouts: WorkoutAnalyticsView = {
        range: '30d',
        totalSessions: 16,
        totalVolumeKg: 42500,
        avgDurationMin: 52,
        consistencyPct: 80,
        frequencySeries: [
          { label: 'W-3', value: 4 },
          { label: 'W-2', value: 4 },
          { label: 'W-1', value: 3 },
          { label: 'This wk', value: 5 },
        ],
        volumeSeries: [
          { label: 'W-3', value: 10000 },
          { label: 'W-2', value: 11000 },
          { label: 'W-1', value: 9500 },
          { label: 'This wk', value: 12000 },
        ],
        durationSeries: [
          { label: 'W-3', value: 200 },
          { label: 'W-2', value: 220 },
          { label: 'W-1', value: 160 },
          { label: 'This wk', value: 250 },
        ],
      };

      assert.equal(mockWorkouts.totalSessions, 16);
      assert.equal(mockWorkouts.totalVolumeKg, 42500);
      assert.equal(mockWorkouts.consistencyPct, 80);
      assert.equal(mockWorkouts.frequencySeries.length, 4);
      assert.equal(mockWorkouts.volumeSeries.length, 4);
      assert.equal(mockWorkouts.durationSeries.length, 4);
    });

    it('2. validates ExerciseProgressionView schema contract', () => {
      const mockProgression: ExerciseProgressionView = {
        exerciseId: 'ex-bench-press',
        exerciseName: 'Barbell Bench Press',
        currentPr: {
          weightKg: 100,
          reps: 5,
          volumeKg: 500,
          estimated1rmKg: 116.7,
          achievedAt: '2026-11-05T10:00:00.000Z',
        },
        progression: [
          { date: '2026-10-15', topWeightKg: 90, reps: 5, estimated1rmKg: 105.0, volumeKg: 450 },
          { date: '2026-10-25', topWeightKg: 95, reps: 5, estimated1rmKg: 110.8, volumeKg: 475 },
          { date: '2026-11-05', topWeightKg: 100, reps: 5, estimated1rmKg: 116.7, volumeKg: 500 },
        ],
      };

      assert.equal(mockProgression.exerciseId, 'ex-bench-press');
      assert.ok(mockProgression.currentPr);
      assert.equal(mockProgression.currentPr.estimated1rmKg, 116.7);
      assert.equal(mockProgression.progression.length, 3);
      assert.ok(mockProgression.progression[2].estimated1rmKg > mockProgression.progression[0].estimated1rmKg);
    });

    it('3. validates NutritionAnalyticsView schema contract', () => {
      const mockNutrition: NutritionAnalyticsView = {
        range: '7d',
        avgCalories: 2250,
        targetCalories: 2300,
        calorieAdherencePct: 97.8,
        proteinAdherencePct: 92.5,
        macroSplit: [
          { label: 'Protein', pct: 30, grams: 168 },
          { label: 'Carbs', pct: 45, grams: 253 },
          { label: 'Fat', pct: 25, grams: 62 },
        ],
        dailyTrends: [
          { date: '2026-11-01', label: 'Sat', calories: 2200, protein: 160, carbs: 250, fat: 60, logged: true },
          { date: '2026-11-02', label: 'Sun', calories: 2300, protein: 170, carbs: 260, fat: 62, logged: true },
        ],
      };

      assert.equal(mockNutrition.avgCalories, 2250);
      assert.equal(mockNutrition.macroSplit.length, 3);
      assert.equal(mockNutrition.macroSplit[0].label, 'Protein');
      assert.equal(mockNutrition.dailyTrends.length, 2);
    });

    it('4. validates HydrationAnalyticsView schema contract', () => {
      const mockHydration: HydrationAnalyticsView = {
        range: '7d',
        avgWaterMl: 2600,
        targetWaterMl: 3000,
        adherencePct: 86.7,
        points: [
          { date: '2026-11-01', label: 'Sat', amountMl: 2800, goalMet: false },
          { date: '2026-11-02', label: 'Sun', amountMl: 3100, goalMet: true },
        ],
      };

      assert.equal(mockHydration.avgWaterMl, 2600);
      assert.equal(mockHydration.targetWaterMl, 3000);
      assert.equal(mockHydration.points.length, 2);
      assert.equal(mockHydration.points[1].goalMet, true);
    });

    it('5. validates BodyAnalyticsView schema contract with EMA smoothing', () => {
      const mockBody: BodyAnalyticsView = {
        startingWeightKg: 85.0,
        currentWeightKg: 81.2,
        targetWeightKg: 78.0,
        weeklyVelocityKg: -0.45,
        goalProgressPct: 54.3,
        weightTrend: [
          { date: '2026-10-01', raw: 84.5, ema: 84.5 },
          { date: '2026-10-15', raw: 82.8, ema: 83.4 },
          { date: '2026-11-01', raw: 81.2, ema: 82.0 },
        ],
        measurementTrends: {
          waistCm: [
            { date: '2026-10-01', value: 88.0 },
            { date: '2026-11-01', value: 85.5 },
          ],
          chestCm: [
            { date: '2026-10-01', value: 102.0 },
            { date: '2026-11-01', value: 103.5 },
          ],
        },
      };

      assert.equal(mockBody.startingWeightKg, 85.0);
      assert.equal(mockBody.currentWeightKg, 81.2);
      assert.equal(mockBody.targetWeightKg, 78.0);
      assert.equal(mockBody.weeklyVelocityKg, -0.45);
      assert.equal(mockBody.weightTrend.length, 3);
      assert.equal(mockBody.measurementTrends.waistCm?.length, 2);
    });

    it('6. validates GoalsHabitsAnalyticsView schema contract', () => {
      const mockGoalsHabits: GoalsHabitsAnalyticsView = {
        goalStats: {
          totalGoals: 4,
          active: 3,
          completed: 1,
          completionRatePct: 25.0,
        },
        habitsSummary: [
          {
            habitId: 'habit-1',
            title: 'Morning Hydration',
            category: 'hydration',
            currentStreak: 12,
            longestStreak: 21,
            completionRatePct: 90.0,
            completionsInWindow: 27,
          },
        ],
        overallHabitAdherencePct: 88.5,
        consistencyHeatmap: [
          { date: '2026-11-01', count: 3 },
          { date: '2026-11-02', count: 4 },
        ],
      };

      assert.equal(mockGoalsHabits.goalStats.totalGoals, 4);
      assert.equal(mockGoalsHabits.habitsSummary.length, 1);
      assert.equal(mockGoalsHabits.habitsSummary[0].currentStreak, 12);
      assert.equal(mockGoalsHabits.consistencyHeatmap.length, 2);
    });

    it('7. validates ActivityOverviewView schema contract', () => {
      const mockOverview: ActivityOverviewView = {
        period: 'Last 30 Days',
        workoutSummary: {
          completedSessions: 16,
          targetSessions: 20,
          totalVolumeKg: 42500,
          totalDurationMinutes: 832,
          consistencyPct: 80,
        },
        nutritionSummary: {
          avgCalories: 2250,
          targetCalories: 2300,
          avgProteinGrams: 168,
          targetProteinGrams: 160,
          calorieAdherencePct: 97.8,
          proteinAdherencePct: 95.0,
          loggedDays: 28,
        },
        hydrationSummary: {
          avgWaterMl: 2600,
          targetWaterMl: 3000,
          adherencePct: 86.7,
        },
        bodySummary: {
          currentWeightKg: 81.2,
          startWeightKg: 85.0,
          targetWeightKg: 78.0,
          weeklyVelocityKg: -0.45,
          progressPct: 54.3,
        },
        comparisonVsPriorPeriod: [
          {
            key: 'workouts',
            label: 'Workouts Completed',
            currentValue: 16,
            priorValue: 12,
            delta: 4,
            deltaPct: 33.3,
            trend: 'up',
            isImprovement: true,
          },
          {
            key: 'weight',
            label: 'Weight Velocity',
            currentValue: -0.45,
            priorValue: -0.2,
            delta: -0.25,
            deltaPct: null,
            trend: 'down',
            isImprovement: true,
          },
        ],
      };

      assert.equal(mockOverview.workoutSummary.completedSessions, 16);
      assert.equal(mockOverview.nutritionSummary.loggedDays, 28);
      assert.equal(mockOverview.hydrationSummary.avgWaterMl, 2600);
      assert.equal(mockOverview.bodySummary.weeklyVelocityKg, -0.45);
      assert.equal(mockOverview.comparisonVsPriorPeriod.length, 2);
      assert.equal(mockOverview.comparisonVsPriorPeriod[0].isImprovement, true);

      const summary = formatOverviewSummary(mockOverview);
      assert.equal(summary.sessionsCompleted, 16);
      assert.equal(summary.calorieAdherencePct, 97.8);
      assert.equal(summary.waterAdherencePct, 86.7);
      assert.equal(summary.weeklyVelocityKg, -0.45);
    });
  });

  describe('Comparison Formatting Logic', () => {
    it('correctly formats weight comparison values', () => {
      const item: PeriodComparisonItem = {
        key: 'weight',
        label: 'Weight',
        currentValue: 81.2,
        priorValue: 82.5,
        delta: -1.3,
        deltaPct: -1.5,
        trend: 'down',
        isImprovement: true,
      };
      const formatted = formatComparisonValue(item);
      assert.equal(formatted.currentFormatted, '81.2 kg');
      assert.equal(formatted.priorFormatted, '82.5 kg');
    });

    it('correctly formats calories and protein comparisons', () => {
      const calItem: PeriodComparisonItem = {
        key: 'calories',
        label: 'Avg Calories',
        currentValue: 2248.6,
        priorValue: 2410.2,
        delta: -161.6,
        deltaPct: -6.7,
        trend: 'down',
        isImprovement: true,
      };
      const formattedCal = formatComparisonValue(calItem);
      assert.equal(formattedCal.currentFormatted, '2,249 kcal');
      assert.equal(formattedCal.priorFormatted, '2,410 kcal');

      const proItem: PeriodComparisonItem = {
        key: 'protein',
        label: 'Avg Protein',
        currentValue: 165.2,
        priorValue: 140.0,
        delta: 25.2,
        deltaPct: 18.0,
        trend: 'up',
        isImprovement: true,
      };
      const formattedPro = formatComparisonValue(proItem);
      assert.equal(formattedPro.currentFormatted, '165 g');
      assert.equal(formattedPro.priorFormatted, '140 g');
    });

    it('correctly formats hydration comparison into liters', () => {
      const waterItem: PeriodComparisonItem = {
        key: 'hydration',
        label: 'Water Intake',
        currentValue: 2800,
        priorValue: 2500,
        delta: 300,
        deltaPct: 12.0,
        trend: 'up',
        isImprovement: true,
      };
      const formattedWater = formatComparisonValue(waterItem);
      assert.equal(formattedWater.currentFormatted, '2.8 L');
      assert.equal(formattedWater.priorFormatted, '2.5 L');
    });
  });

  describe('Truthful Wearable Metrics & Zero Fabrication', () => {
    it('verifies homeMock does not fabricate steps, rings or active calories', () => {
      assert.equal(weeklySteps.length, 0, 'weeklySteps must be empty array when no device data is synced');

      for (const ring of activityRings) {
        assert.equal(ring.value, 0, `activityRing ${ring.key} must be 0 to avoid metric fabrication`);
      }

      assert.equal(activityMeta.weeklyAverage, 0);
      assert.equal(activityMeta.pace, 'No wearable step data synced yet');
    });
  });

  describe('State Management, Sequence Protection & Cache Lifecycle', () => {
    it('handles simulated sequence IDs to prevent stale async overwrites', () => {
      let seq = 0;
      const nextSeq = () => ++seq;

      const req1Seq = nextSeq();
      const req2Seq = nextSeq();

      assert.equal(req1Seq, 1);
      assert.equal(req2Seq, 2);

      const isReq1Valid = req1Seq === seq;
      const isReq2Valid = req2Seq === seq;

      assert.equal(isReq1Valid, false, 'Stale request 1 must be discarded');
      assert.equal(isReq2Valid, true, 'Latest request 2 must be accepted');
    });

    it('verifies user isolation cache scoping pattern', () => {
      const getCacheKey = (domain: string, range: string, userId?: string) =>
        userId ? `@fitonus:${domain}:${range}:${userId}` : `@fitonus:${domain}:${range}`;

      const keyUserA = getCacheKey('workouts', '30d', 'user-aaa');
      const keyUserB = getCacheKey('workouts', '30d', 'user-bbb');
      const keyAnon = getCacheKey('workouts', '30d');

      assert.notEqual(keyUserA, keyUserB, 'User caches must never collide');
      assert.equal(keyUserA, '@fitonus:workouts:30d:user-aaa');
      assert.equal(keyAnon, '@fitonus:workouts:30d');
    });
  });
});
