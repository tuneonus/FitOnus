import type { WeightLog } from '../domain/weight-log.js';
import type { BodyMeasurement } from '../domain/body-measurement.js';
import type { LogWeightResult } from './use-cases/log-weight.js';
import type { LogMeasurementResult, MeasurementDiffs } from './use-cases/log-measurement.js';
import type { GetWeightHistoryResult } from './use-cases/get-weight-history.js';
import type { GetMeasurementsResult } from './use-cases/get-measurements.js';

export interface WeightLogView {
  id: string;
  userId: string;
  weightKg: number;
  loggedAt: string;
  source: 'manual' | 'synced';
  notes: string | null;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toWeightLogView(log: WeightLog): WeightLogView {
  return {
    id: log.id,
    userId: log.userId,
    weightKg: log.weightKg,
    loggedAt: log.loggedAt.toISOString(),
    source: log.source,
    notes: log.notes ?? null,
    clientId: log.clientId ?? null,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  };
}

export interface LogWeightResponseView {
  log: WeightLogView;
  isNew: boolean;
  currentWeight: number;
  startingWeight: number | null;
  changeFromStart: number;
  changeFromPrevious: number;
}

export function toLogWeightResponseView(res: LogWeightResult): LogWeightResponseView {
  return {
    log: toWeightLogView(res.log),
    isNew: res.isNew,
    currentWeight: res.currentWeight,
    startingWeight: res.startingWeight,
    changeFromStart: res.changeFromStart,
    changeFromPrevious: res.changeFromPrevious,
  };
}

export interface WeightHistoryView {
  summary: {
    currentWeightKg: number | null;
    startingWeightKg: number | null;
    targetWeightKg: number | null;
    latestLoggedAt: string | null;
    totalLogsCount: number;
  };
  points: { label: string; value: number }[];
  entries: {
    id: string;
    date: string;
    time?: string;
    value: number;
    source: 'manual' | 'synced';
    note?: string;
  }[];
  total: number;
}

export function toWeightHistoryView(res: GetWeightHistoryResult): WeightHistoryView {
  return {
    summary: {
      currentWeightKg: res.summary.currentWeightKg,
      startingWeightKg: res.summary.startingWeightKg,
      targetWeightKg: res.summary.targetWeightKg,
      latestLoggedAt: res.summary.latestLoggedAt ? res.summary.latestLoggedAt.toISOString() : null,
      totalLogsCount: res.summary.totalLogsCount,
    },
    points: res.points,
    entries: res.entries,
    total: res.total,
  };
}

export interface BodyMeasurementView {
  id: string;
  userId: string;
  loggedAt: string;
  waistCm: number | null;
  chestCm: number | null;
  hipCm: number | null;
  armCm: number | null;
  neckCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  notes: string | null;
  source: 'manual' | 'synced';
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toBodyMeasurementView(m: BodyMeasurement): BodyMeasurementView {
  return {
    id: m.id,
    userId: m.userId,
    loggedAt: m.loggedAt.toISOString(),
    waistCm: m.waistCm,
    chestCm: m.chestCm,
    hipCm: m.hipCm,
    armCm: m.armCm,
    neckCm: m.neckCm,
    bodyFatPct: m.bodyFatPct,
    muscleMassKg: m.muscleMassKg,
    notes: m.notes ?? null,
    source: m.source,
    clientId: m.clientId ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export interface LogMeasurementResponseView {
  measurement: BodyMeasurementView;
  isNew: boolean;
  diffs: MeasurementDiffs;
}

export function toLogMeasurementResponseView(res: LogMeasurementResult): LogMeasurementResponseView {
  return {
    measurement: toBodyMeasurementView(res.measurement),
    isNew: res.isNew,
    diffs: res.diffs,
  };
}

export interface MeasurementHistoryView {
  latest: {
    id: string;
    date: string;
    waist?: number;
    chest?: number;
    hip?: number;
    arm?: number;
    neck?: number;
    bodyFat?: number;
    muscleMass?: number;
  } | null;
  diffs: MeasurementDiffs;
  history: {
    id: string;
    date: string;
    values: {
      waist?: number;
      chest?: number;
      hip?: number;
      arm?: number;
      neck?: number;
      bodyFat?: number;
      muscleMass?: number;
    };
  }[];
  total: number;
}

export function toMeasurementHistoryView(res: GetMeasurementsResult): MeasurementHistoryView {
  return {
    latest: res.latest,
    diffs: res.diffs,
    history: res.history,
    total: res.total,
  };
}

