export type OccurrenceStatus = 'upcoming' | 'active' | 'evaluating' | 'closed' | 'archived';

export interface ChallengeOccurrenceProps {
  id: string;
  challengeId: string;
  occurrenceKey: string;
  periodStart: Date;
  periodEnd: Date;
  status: OccurrenceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class ChallengeOccurrence {
  readonly id: string;
  readonly challengeId: string;
  readonly occurrenceKey: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly status: OccurrenceStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ChallengeOccurrenceProps) {
    if (!props.id) throw new Error('Occurrence id is required');
    if (!props.challengeId) throw new Error('Occurrence challengeId is required');
    if (!props.occurrenceKey) throw new Error('Occurrence key is required');
    if (props.periodEnd.getTime() <= props.periodStart.getTime()) {
      throw new Error('Occurrence periodEnd must be after periodStart');
    }

    this.id = props.id;
    this.challengeId = props.challengeId;
    this.occurrenceKey = props.occurrenceKey;
    this.periodStart = props.periodStart;
    this.periodEnd = props.periodEnd;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  isActiveAt(date: Date = new Date()): boolean {
    const t = date.getTime();
    return this.status === 'active' && t >= this.periodStart.getTime() && t <= this.periodEnd.getTime();
  }

  isClaimableAt(date: Date = new Date(), graceDays = 7): boolean {
    if (this.status === 'closed' || this.status === 'archived') {
      return false;
    }
    const graceMs = graceDays * 24 * 60 * 60 * 1000;
    const deadline = this.periodEnd.getTime() + graceMs;
    return date.getTime() <= deadline;
  }
}

