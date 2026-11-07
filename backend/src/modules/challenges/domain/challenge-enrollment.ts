export type EnrollmentStatus = 'joined' | 'in_progress' | 'completed' | 'claimed' | 'expired';

export interface ChallengeEnrollmentProps {
  id: string;
  userId: string;
  occurrenceId: string;
  challengeId: string;
  status: EnrollmentStatus;
  currentProgress: number;
  targetValue: number;
  completedAt?: Date | null;
  claimedAt?: Date | null;
  lastEvaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class ChallengeEnrollment {
  readonly id: string;
  readonly userId: string;
  readonly occurrenceId: string;
  readonly challengeId: string;
  private _status: EnrollmentStatus;
  private _currentProgress: number;
  readonly targetValue: number;
  private _completedAt: Date | null;
  private _claimedAt: Date | null;
  private _lastEvaluatedAt: Date;
  readonly createdAt: Date;
  private _updatedAt: Date;

  constructor(props: ChallengeEnrollmentProps) {
    if (!props.id) throw new Error('Enrollment id is required');
    if (!props.userId) throw new Error('Enrollment userId is required');
    if (!props.occurrenceId) throw new Error('Enrollment occurrenceId is required');
    if (!props.challengeId) throw new Error('Enrollment challengeId is required');
    if (props.targetValue <= 0) throw new Error('Enrollment targetValue must be greater than 0');
    if (props.currentProgress < 0) throw new Error('Enrollment currentProgress cannot be negative');

    this.id = props.id;
    this.userId = props.userId;
    this.occurrenceId = props.occurrenceId;
    this.challengeId = props.challengeId;
    this._status = props.status;
    this._currentProgress = props.currentProgress;
    this.targetValue = props.targetValue;
    this._completedAt = props.completedAt ?? null;
    this._claimedAt = props.claimedAt ?? null;
    this._lastEvaluatedAt = props.lastEvaluatedAt;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  get status(): EnrollmentStatus {
    return this._status;
  }

  get currentProgress(): number {
    return this._currentProgress;
  }

  get completedAt(): Date | null {
    return this._completedAt;
  }

  get claimedAt(): Date | null {
    return this._claimedAt;
  }

  get lastEvaluatedAt(): Date {
    return this._lastEvaluatedAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get progressRatio(): number {
    if (this.targetValue <= 0) return 0;
    const ratio = this._currentProgress / this.targetValue;
    return Math.max(0, Math.min(1, Math.round(ratio * 10000) / 10000));
  }

  isCompleted(): boolean {
    return this._status === 'completed' || this._status === 'claimed';
  }

  isClaimed(): boolean {
    return this._status === 'claimed' && this._claimedAt !== null;
  }

  canClaim(): boolean {
    return this._status === 'completed' && this._claimedAt === null;
  }

  updateProgress(newProgress: number, evaluatedAt: Date = new Date()): void {
    const validProgress = Math.max(0, newProgress);
    this._currentProgress = Math.round(validProgress * 100) / 100;
    this._lastEvaluatedAt = evaluatedAt;
    this._updatedAt = evaluatedAt;

    if (this._currentProgress >= this.targetValue && this._status !== 'claimed') {
      this._status = 'completed';
      if (!this._completedAt) {
        this._completedAt = evaluatedAt;
      }
    } else if (this._status === 'joined' && this._currentProgress > 0) {
      this._status = 'in_progress';
    }
  }

  markClaimed(claimedAt: Date = new Date()): void {
    if (this._status !== 'completed') {
      throw new Error(`Cannot claim enrollment in status "${this._status}". Must be completed.`);
    }
    this._status = 'claimed';
    this._claimedAt = claimedAt;
    this._updatedAt = claimedAt;
  }
}
