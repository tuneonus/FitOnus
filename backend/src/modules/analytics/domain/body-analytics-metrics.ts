/**
 * Body Composition Analytics Domain Models & Calculation Engine
 *
 * Implements pure deterministic algorithms for EMA-smoothed weight curves,
 * rate of change (velocity kg/week), goal progress percentages, and
 * body circumference/composition progression series.
 */

export interface RawWeightLogRecord {
  id: string;
  weightKg: number;
  loggedAt: Date;
}

export interface RawMeasurementRecord {
  id: string;
  loggedAt: Date;
  waistCm: number | null;
  chestCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  neckCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
}

export interface WeightTrendPoint {
  date: string;
  raw: number;
  ema: number;
}

export interface MeasurementPoint {
  date: string;
  value: number;
}

export interface MeasurementTrendSeries {
  waistCm?: MeasurementPoint[];
  chestCm?: MeasurementPoint[];
  hipCm?: MeasurementPoint[];
  armCm?: MeasurementPoint[];
  neckCm?: MeasurementPoint[];
  bodyFatPct?: MeasurementPoint[];
  muscleMassKg?: MeasurementPoint[];
}

export interface BodyAnalyticsSummary {
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  weeklyVelocityKg: number;
  goalProgressPct: number;
  weightTrend: WeightTrendPoint[];
  measurementTrends: MeasurementTrendSeries;
}

/**
 * Calculates Exponential Moving Average (EMA) series for body weight logs.
 *
 * Designed to filter out hydration/glycogen noise and reveal true biological mass trend.
 */
export function calculateEmaSeries(
  logs: readonly RawWeightLogRecord[],
  alpha: number = 0.1,
  decimals: number = 1,
): WeightTrendPoint[] {
  if (!logs || logs.length === 0) return [];

  // Ensure chronological order
  const sorted = [...logs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const factor = Math.pow(10, decimals);
  const clampedAlpha = Math.min(Math.max(alpha, 0.01), 1.0);

  const result: WeightTrendPoint[] = [];
  let currentEma = sorted[0]!.weightKg;

  for (let i = 0; i < sorted.length; i++) {
    const raw = sorted[i]!.weightKg;
    if (i === 0) {
      currentEma = raw;
    } else {
      currentEma = raw * clampedAlpha + currentEma * (1 - clampedAlpha);
    }

    const emaRounded = Math.round(currentEma * factor) / factor;
    const dateStr = sorted[i]!.loggedAt.toISOString().slice(0, 10);

    result.push({
      date: dateStr,
      raw: Math.round(raw * factor) / factor,
      ema: emaRounded,
    });
  }

  return result;
}

/**
 * Calculates rate of weight change (velocity) in kilograms per week.
 *
 * Formula:
 *   velocity = ((latest - earliest) / elapsedDays) * 7
 *
 * Returns 0 if less than 2 logs or elapsed time is less than 1 day.
 */
export function calculateWeightVelocity(
  firstLog: { weightKg: number; loggedAt: Date } | null,
  lastLog: { weightKg: number; loggedAt: Date } | null,
): number {
  if (!firstLog || !lastLog) return 0;
  const elapsedMs = Math.abs(lastLog.loggedAt.getTime() - firstLog.loggedAt.getTime());
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);

  if (elapsedDays < 1.0) return 0;

  const deltaKg = lastLog.weightKg - firstLog.weightKg;
  const weeklyRate = (deltaKg / elapsedDays) * 7;
  return Math.round(weeklyRate * 100) / 100;
}

/**
 * Calculates percentage progress towards target body weight, clamped between 0 and 100%.
 *
 * Handles both weight loss (start > target) and weight gain (start < target).
 */
export function calculateGoalWeightProgress(
  startingWeightKg: number | null,
  currentWeightKg: number | null,
  targetWeightKg: number | null,
): number {
  if (
    startingWeightKg === null ||
    currentWeightKg === null ||
    targetWeightKg === null ||
    startingWeightKg === targetWeightKg
  ) {
    if (currentWeightKg !== null && targetWeightKg !== null && currentWeightKg === targetWeightKg) {
      return 100;
    }
    return 0;
  }

  const isWeightLoss = startingWeightKg > targetWeightKg;
  let progressPct: number;

  if (isWeightLoss) {
    // Loss: progress increases as weight decreases towards target
    const totalToLose = startingWeightKg - targetWeightKg;
    const actualLost = startingWeightKg - currentWeightKg;
    progressPct = (actualLost / totalToLose) * 100;
  } else {
    // Gain: progress increases as weight increases towards target
    const totalToGain = targetWeightKg - startingWeightKg;
    const actualGained = currentWeightKg - startingWeightKg;
    progressPct = (actualGained / totalToGain) * 100;
  }

  return Math.min(100, Math.max(0, Math.round(progressPct * 10) / 10));
}

/**
 * Maps raw body measurements into multi-metric chronological time series.
 */
export function buildMeasurementTrends(
  measurements: readonly RawMeasurementRecord[],
): MeasurementTrendSeries {
  if (!measurements || measurements.length === 0) return {};

  const sorted = [...measurements].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const series: MeasurementTrendSeries = {};

  for (const m of sorted) {
    const dateStr = m.loggedAt.toISOString().slice(0, 10);

    if (m.waistCm !== null) {
      series.waistCm = series.waistCm ?? [];
      series.waistCm.push({ date: dateStr, value: Number(m.waistCm) });
    }
    if (m.chestCm !== null) {
      series.chestCm = series.chestCm ?? [];
      series.chestCm.push({ date: dateStr, value: Number(m.chestCm) });
    }
    if (m.hipCm !== null) {
      series.hipCm = series.hipCm ?? [];
      series.hipCm.push({ date: dateStr, value: Number(m.hipCm) });
    }
    if (m.armCm !== null) {
      series.armCm = series.armCm ?? [];
      series.armCm.push({ date: dateStr, value: Number(m.armCm) });
    }
    if (m.neckCm !== null) {
      series.neckCm = series.neckCm ?? [];
      series.neckCm.push({ date: dateStr, value: Number(m.neckCm) });
    }
    if (m.bodyFatPct !== null) {
      series.bodyFatPct = series.bodyFatPct ?? [];
      series.bodyFatPct.push({ date: dateStr, value: Number(m.bodyFatPct) });
    }
    if (m.muscleMassKg !== null) {
      series.muscleMassKg = series.muscleMassKg ?? [];
      series.muscleMassKg.push({ date: dateStr, value: Number(m.muscleMassKg) });
    }
  }

  return series;
}

/**
 * Assembles full body composition analytics summary.
 */
export function summarizeBodyAnalytics(
  logs: readonly RawWeightLogRecord[],
  measurements: readonly RawMeasurementRecord[],
  startingWeightKg: number | null,
  currentWeightKg: number | null,
  targetWeightKg: number | null,
): BodyAnalyticsSummary {
  const sortedLogs = [...logs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const firstLog = sortedLogs[0] ?? null;
  const lastLog = sortedLogs[sortedLogs.length - 1] ?? null;

  const effectiveCurrent = currentWeightKg ?? lastLog?.weightKg ?? null;
  const effectiveStarting = startingWeightKg ?? firstLog?.weightKg ?? effectiveCurrent;

  const weeklyVelocityKg = calculateWeightVelocity(firstLog, lastLog);
  const goalProgressPct = calculateGoalWeightProgress(effectiveStarting, effectiveCurrent, targetWeightKg);
  const weightTrend = calculateEmaSeries(sortedLogs);
  const measurementTrends = buildMeasurementTrends(measurements);

  return {
    startingWeightKg: effectiveStarting,
    currentWeightKg: effectiveCurrent,
    targetWeightKg,
    weeklyVelocityKg,
    goalProgressPct,
    weightTrend,
    measurementTrends,
  };
}
