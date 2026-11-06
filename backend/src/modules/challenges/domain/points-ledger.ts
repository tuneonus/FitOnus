export type PointSourceType =
  | 'challenge'
  | 'badge'
  | 'habit_streak'
  | 'workout_milestone'
  | 'admin_adjustment';

export interface PointsLedgerEntryProps {
  id: string;
  userId: string;
  points: number;
  sourceType: PointSourceType;
  sourceId: string;
  description: string;
  createdAt: Date;
}

export class PointsLedgerEntry {
  readonly id: string;
  readonly userId: string;
  readonly points: number;
  readonly sourceType: PointSourceType;
  readonly sourceId: string;
  readonly description: string;
  readonly createdAt: Date;

  constructor(props: PointsLedgerEntryProps) {
    if (!props.id) throw new Error('PointsLedgerEntry id is required');
    if (!props.userId) throw new Error('PointsLedgerEntry userId is required');
    if (props.points <= 0) throw new Error('PointsLedgerEntry points must be greater than 0');
    if (!props.sourceId) throw new Error('PointsLedgerEntry sourceId is required');

    this.id = props.id;
    this.userId = props.userId;
    this.points = Math.floor(props.points);
    this.sourceType = props.sourceType;
    this.sourceId = props.sourceId;
    this.description = props.description;
    this.createdAt = props.createdAt;
  }
}

