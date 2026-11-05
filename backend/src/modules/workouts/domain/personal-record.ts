export const PR_RECORD_TYPES = ['max_weight', 'max_reps', 'max_volume', 'estimated_1rm'] as const;
export type PrRecordType = (typeof PR_RECORD_TYPES)[number];

export interface PersonalRecordProps {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseName?: string;
  recordType: PrRecordType;
  weightKg: number;
  reps: number;
  volumeKg: number;
  estimated1rmKg: number;
  sessionId: string | null;
  achievedAt: Date;
  createdAt: Date;
}

export class PersonalRecord {
  readonly id: string;
  readonly userId: string;
  readonly exerciseId: string;
  readonly exerciseName?: string;
  readonly recordType: PrRecordType;
  readonly weightKg: number;
  readonly reps: number;
  readonly volumeKg: number;
  readonly estimated1rmKg: number;
  readonly sessionId: string | null;
  readonly achievedAt: Date;
  readonly createdAt: Date;

  constructor(props: PersonalRecordProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.exerciseId = props.exerciseId;
    this.exerciseName = props.exerciseName;
    this.recordType = props.recordType;
    this.weightKg = props.weightKg;
    this.reps = props.reps;
    this.volumeKg = props.volumeKg;
    this.estimated1rmKg = props.estimated1rmKg;
    this.sessionId = props.sessionId;
    this.achievedAt = props.achievedAt;
    this.createdAt = props.createdAt;
  }
}

export interface CandidateSet {
  exerciseId: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface ExistingBestRecords {
  maxWeightKg: number;
  maxRepsAtWeight: Map<number, number>; // weightKg -> maxReps
  maxVolumeKg: number;
  maxEstimated1RM: number;
}

export interface DetectedPR {
  exerciseId: string;
  recordType: PrRecordType;
  weightKg: number;
  reps: number;
  volumeKg: number;
  estimated1rmKg: number;
}

/**
 * Evaluates completed sets against existing user bests.
 * Only non-warmup sets with valid weight/reps are considered.
 */
export function evaluateSetPRs(set: CandidateSet, currentBests: ExistingBestRecords): DetectedPR[] {
  if (set.isWarmup || set.reps <= 0) return [];

  const detected: DetectedPR[] = [];
  const volume = set.weightKg * set.reps;
  const e1rm = set.weightKg > 0 ? Number((set.weightKg * (1 + set.reps / 30)).toFixed(2)) : 0;

  // 1. Max Weight PR (only if weight > 0)
  if (set.weightKg > 0 && set.weightKg > currentBests.maxWeightKg) {
    detected.push({
      exerciseId: set.exerciseId,
      recordType: 'max_weight',
      weightKg: set.weightKg,
      reps: set.reps,
      volumeKg: volume,
      estimated1rmKg: e1rm,
    });
    currentBests.maxWeightKg = set.weightKg;
  }

  // 2. Max Reps at this weight PR
  const previousReps = currentBests.maxRepsAtWeight.get(set.weightKg) ?? 0;
  if (set.reps > previousReps && previousReps > 0) {
    detected.push({
      exerciseId: set.exerciseId,
      recordType: 'max_reps',
      weightKg: set.weightKg,
      reps: set.reps,
      volumeKg: volume,
      estimated1rmKg: e1rm,
    });
    currentBests.maxRepsAtWeight.set(set.weightKg, set.reps);
  } else if (!currentBests.maxRepsAtWeight.has(set.weightKg)) {
    currentBests.maxRepsAtWeight.set(set.weightKg, set.reps);
  }

  // 3. Max Single Set Volume PR
  if (volume > 0 && volume > currentBests.maxVolumeKg) {
    detected.push({
      exerciseId: set.exerciseId,
      recordType: 'max_volume',
      weightKg: set.weightKg,
      reps: set.reps,
      volumeKg: volume,
      estimated1rmKg: e1rm,
    });
    currentBests.maxVolumeKg = volume;
  }

  // 4. Max Estimated 1RM PR
  if (e1rm > 0 && e1rm > currentBests.maxEstimated1RM) {
    detected.push({
      exerciseId: set.exerciseId,
      recordType: 'estimated_1rm',
      weightKg: set.weightKg,
      reps: set.reps,
      volumeKg: volume,
      estimated1rmKg: e1rm,
    });
    currentBests.maxEstimated1RM = e1rm;
  }

  return detected;
}
