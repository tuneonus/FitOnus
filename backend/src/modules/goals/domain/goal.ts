import { calculateGoalProgress, type GoalCadence, type GoalDirection } from './goal-calculator.js';

export type { GoalCadence, GoalDirection };

export type GoalType =
  | 'weightLoss'
  | 'muscleGain'
  | 'maintain'
  | 'run5k'
  | 'run10k'
  | 'marathon'
  | 'steps'
  | 'water'
  | 'protein'
  | 'streak'
  | 'workoutFrequency'
  | 'custom';

export type GoalStatus = 'active' | 'completed' | 'abandoned' | 'paused';
export type TelemetrySource = 'weight_logs' | 'water_intake' | 'nutrition_meals' | 'workout_sessions' | 'manual';

export interface GoalProps {
  id: string;
  userId: string;
  type: GoalType;
  title: string;
  description?: string | null;
  metricUnit: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  cadence: GoalCadence;
  direction: GoalDirection;
  status: GoalStatus;
  isPrimary: boolean;
  deadlineLabel: string;
  targetDate?: string | null; // YYYY-MM-DD
  completedAt?: Date | null;
  telemetrySource?: TelemetrySource | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export class Goal {
  private props: GoalProps;

  constructor(props: GoalProps) {
    if (!props.id) throw new Error('Goal ID is required');
    if (!props.userId) throw new Error('User ID is required');
    if (!props.title || props.title.trim().length === 0) throw new Error('Goal title is required');
    if (props.startValue < 0 || props.currentValue < 0 || props.targetValue < 0) {
      throw new Error('Goal values cannot be negative');
    }

    this.props = {
      ...props,
      metadata: props.metadata ?? {},
      deletedAt: props.deletedAt ?? null,
      completedAt: props.completedAt ?? null,
      targetDate: props.targetDate ?? null,
      telemetrySource: props.telemetrySource ?? 'manual',
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get type(): GoalType {
    return this.props.type;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description ?? null;
  }
  get metricUnit(): string {
    return this.props.metricUnit;
  }
  get startValue(): number {
    return this.props.startValue;
  }
  get currentValue(): number {
    return this.props.currentValue;
  }
  get targetValue(): number {
    return this.props.targetValue;
  }
  get cadence(): GoalCadence {
    return this.props.cadence;
  }
  get direction(): GoalDirection {
    return this.props.direction;
  }
  get status(): GoalStatus {
    return this.props.status;
  }
  get isPrimary(): boolean {
    return this.props.isPrimary;
  }
  get deadlineLabel(): string {
    return this.props.deadlineLabel;
  }
  get targetDate(): string | null {
    return this.props.targetDate ?? null;
  }
  get completedAt(): Date | null {
    return this.props.completedAt ?? null;
  }
  get telemetrySource(): TelemetrySource {
    return this.props.telemetrySource ?? 'manual';
  }
  get metadata(): Record<string, unknown> {
    return this.props.metadata ?? {};
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt ?? null;
  }

  get progress(): number {
    return calculateGoalProgress({
      start: this.props.startValue,
      current: this.props.currentValue,
      target: this.props.targetValue,
      cadence: this.props.cadence,
      direction: this.props.direction,
    });
  }

  get isCompleted(): boolean {
    return this.props.status === 'completed';
  }

  updateProgress(newCurrentValue: number): void {
    if (newCurrentValue < 0) throw new Error('Progress value cannot be negative');
    this.props.currentValue = newCurrentValue;
    this.props.updatedAt = new Date();

    if (this.props.cadence === 'once') {
      if (this.props.direction === 'decrease' && newCurrentValue <= this.props.targetValue) {
        this.complete();
      } else if (this.props.direction === 'increase' && newCurrentValue >= this.props.targetValue) {
        this.complete();
      }
    }
  }

  complete(completedAt: Date = new Date()): void {
    this.props.status = 'completed';
    this.props.completedAt = completedAt;
    this.props.updatedAt = new Date();
  }

  reopen(): void {
    this.props.status = 'active';
    this.props.completedAt = null;
    this.props.updatedAt = new Date();
  }

  setStatus(status: GoalStatus): void {
    this.props.status = status;
    if (status === 'completed' && !this.props.completedAt) {
      this.props.completedAt = new Date();
    } else if (status !== 'completed') {
      this.props.completedAt = null;
    }
    this.props.updatedAt = new Date();
  }

  setPrimary(isPrimary: boolean): void {
    this.props.isPrimary = isPrimary;
    this.props.updatedAt = new Date();
  }

  updateDetails(params: {
    title?: string;
    description?: string | null;
    targetValue?: number;
    deadlineLabel?: string;
    targetDate?: string | null;
  }): void {
    if (params.title !== undefined) {
      if (!params.title.trim()) throw new Error('Goal title cannot be empty');
      this.props.title = params.title.trim();
    }
    if (params.description !== undefined) {
      this.props.description = params.description;
    }
    if (params.targetValue !== undefined) {
      if (params.targetValue < 0) throw new Error('Target value cannot be negative');
      this.props.targetValue = params.targetValue;
    }
    if (params.deadlineLabel !== undefined) {
      this.props.deadlineLabel = params.deadlineLabel;
    }
    if (params.targetDate !== undefined) {
      this.props.targetDate = params.targetDate;
    }
    this.props.updatedAt = new Date();
  }
}
