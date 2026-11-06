import type { ChartPoint, TimeRange } from '@/shared/types/health';
import type { MeasurementKey } from '@/features/weight-tracking/types/weight';

export type MetricKey =
  | 'weight'
  | 'calories'
  | 'sleep'
  | 'protein'
  | 'workouts'
  | 'recovery'
  | 'steps'
  | 'water';

// --- Weight Types ---

export interface WeightSummary {
  currentWeightKg: number | null;
  startingWeightKg: number | null;
  targetWeightKg: number | null;
  latestLoggedAt: string | null;
  totalLogsCount: number;
}

export interface BackendWeightEntry {
  id: string;
  date: string;
  time?: string | undefined;
  value: number;
  source: 'manual' | 'synced';
  note?: string | undefined;
}

export interface WeightHistoryResponse {
  summary: WeightSummary;
  points: ChartPoint[];
  entries: BackendWeightEntry[];
  total: number;
}

export interface LogWeightInput {
  weightKg: number;
  loggedAt?: string | undefined;
  source?: 'manual' | 'synced' | undefined;
  notes?: string | undefined;
  clientId?: string | undefined;
}

export interface LogWeightResponse {
  log: {
    id: string;
    userId: string;
    weightKg: number;
    loggedAt: string;
    source: 'manual' | 'synced';
    notes: string | null;
    clientId?: string | null | undefined;
    createdAt: string;
    updatedAt: string;
  };
  isNew: boolean;
  currentWeight: number;
  startingWeight: number | null;
  changeFromStart: number;
  changeFromPrevious: number;
}

export interface UpdateWeightInput {
  weightKg?: number | undefined;
  loggedAt?: string | undefined;
  source?: 'manual' | 'synced' | undefined;
  notes?: string | null | undefined;
}

// --- Measurement Types ---

export interface MeasurementDiffs {
  waist?: number | undefined;
  chest?: number | undefined;
  hip?: number | undefined;
  arm?: number | undefined;
  neck?: number | undefined;
  bodyFat?: number | undefined;
  muscleMass?: number | undefined;
}

export interface BackendMeasurementItem {
  id: string;
  date: string;
  values: Partial<Record<MeasurementKey, number>>;
}

export interface LatestMeasurement {
  id: string;
  date: string;
  waist?: number | undefined;
  chest?: number | undefined;
  hip?: number | undefined;
  arm?: number | undefined;
  neck?: number | undefined;
  bodyFat?: number | undefined;
  muscleMass?: number | undefined;
}

export interface MeasurementHistoryResponse {
  latest: LatestMeasurement | null;
  diffs: MeasurementDiffs;
  history: BackendMeasurementItem[];
  total: number;
}

export interface LogMeasurementInput {
  waistCm?: number | null | undefined;
  chestCm?: number | null | undefined;
  hipCm?: number | null | undefined;
  armCm?: number | null | undefined;
  neckCm?: number | null | undefined;
  bodyFatPct?: number | null | undefined;
  muscleMassKg?: number | null | undefined;
  notes?: string | null | undefined;
  source?: 'manual' | 'synced' | undefined;
  clientId?: string | undefined;
  loggedAt?: string | undefined;
}

export interface LogMeasurementResponse {
  measurement: {
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
    clientId?: string | null | undefined;
    createdAt: string;
    updatedAt: string;
  };
  isNew: boolean;
  diffs: MeasurementDiffs;
}

// --- Analytics, Comparison, Achievements & Reports ---

export interface ProgressAnalyticsResponse {
  metric: MetricKey;
  label: string;
  unit: string;
  chart: 'line' | 'bar';
  lowerIsBetter?: boolean | undefined;
  hasDeviceData: boolean;
  goal?: number | undefined;
  firstValue: number;
  latestValue: number;
  delta: number;
  points: ChartPoint[];
}

export interface ComparisonItem {
  label: string;
  current: string;
  previous: string;
  better: boolean;
}

export interface PeriodComparisonResponse {
  title: string;
  comparisons: ComparisonItem[];
}

export interface AchievementItem {
  title: string;
  detail: string;
  earned: boolean;
}

export interface AchievementsResponse {
  achievements: AchievementItem[];
}

export interface ProgressReportStat {
  label: string;
  value: string;
  unit: string;
  note?: string | undefined;
  good?: boolean | undefined;
}

export interface ProgressReportResponse {
  period: string;
  generated: string;
  headline: string;
  stats: ProgressReportStat[];
  calories: { label: string; value: number }[];
  workouts: { day: string; title: string }[];
  achievements: string[];
  improvements: string[];
  nextGoals: string[];
}

/**
 * Sanitizes and maps mobile UI MeasurementKey values to backend LogMeasurementInput.
 * Strips zero, undefined, or out-of-range metrics to guarantee backend schema validation.
 */
export function sanitizeMeasurementInput(
  values: Partial<Record<MeasurementKey, number>>,
  clientId?: string,
  loggedAt?: string,
): LogMeasurementInput {
  const payload: LogMeasurementInput = {
    source: 'manual',
    loggedAt: loggedAt || new Date().toISOString(),
    ...(clientId ? { clientId } : {}),
  };

  if (typeof values.waist === 'number' && values.waist >= 30.1 && values.waist <= 249.9) {
    payload.waistCm = values.waist;
  }
  if (typeof values.chest === 'number' && values.chest >= 30.1 && values.chest <= 249.9) {
    payload.chestCm = values.chest;
  }
  if (typeof values.hip === 'number' && values.hip >= 30.1 && values.hip <= 249.9) {
    payload.hipCm = values.hip;
  }
  if (typeof values.arm === 'number' && values.arm >= 10.1 && values.arm <= 99.9) {
    payload.armCm = values.arm;
  }
  if (typeof values.neck === 'number' && values.neck >= 15.1 && values.neck <= 79.9) {
    payload.neckCm = values.neck;
  }
  if (typeof values.bodyFat === 'number' && values.bodyFat >= 3.0 && values.bodyFat <= 60.0) {
    payload.bodyFatPct = values.bodyFat;
  }
  if (typeof values.muscleMass === 'number' && values.muscleMass >= 10.0 && values.muscleMass <= 200.0) {
    payload.muscleMassKg = values.muscleMass;
  }

  return payload;
}

