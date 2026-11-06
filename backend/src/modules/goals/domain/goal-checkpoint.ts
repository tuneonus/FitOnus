export interface GoalCheckpointProps {
  id: string;
  goalId: string;
  userId: string;
  value: number;
  date: string; // YYYY-MM-DD
  recordedAt: Date;
  source: string;
  notes?: string | null;
}

export class GoalCheckpoint {
  private props: GoalCheckpointProps;

  constructor(props: GoalCheckpointProps) {
    if (!props.id) throw new Error('Checkpoint ID is required');
    if (!props.goalId) throw new Error('Goal ID is required');
    if (!props.userId) throw new Error('User ID is required');
    if (props.value < 0) throw new Error('Checkpoint value cannot be negative');

    this.props = {
      ...props,
      notes: props.notes ?? null,
      source: props.source || 'manual',
    };
  }

  get id(): string {
    return this.props.id;
  }
  get goalId(): string {
    return this.props.goalId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get value(): number {
    return this.props.value;
  }
  get date(): string {
    return this.props.date;
  }
  get recordedAt(): Date {
    return this.props.recordedAt;
  }
  get source(): string {
    return this.props.source;
  }
  get notes(): string | null {
    return this.props.notes ?? null;
  }
}
