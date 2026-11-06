export type BadgeTriggerType = 'challenge' | 'milestone' | 'streak' | 'pr' | 'admin';

export interface UserBadgeProps {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: Date;
  triggerType: BadgeTriggerType;
  triggerId?: string | null;
  metadata?: Record<string, unknown>;
}

export class UserBadge {
  readonly id: string;
  readonly userId: string;
  readonly badgeId: string;
  readonly earnedAt: Date;
  readonly triggerType: BadgeTriggerType;
  readonly triggerId: string | null;
  readonly metadata: Record<string, unknown>;

  constructor(props: UserBadgeProps) {
    if (!props.id) throw new Error('UserBadge id is required');
    if (!props.userId) throw new Error('UserBadge userId is required');
    if (!props.badgeId) throw new Error('UserBadge badgeId is required');

    this.id = props.id;
    this.userId = props.userId;
    this.badgeId = props.badgeId;
    this.earnedAt = props.earnedAt;
    this.triggerType = props.triggerType;
    this.triggerId = props.triggerId ?? null;
    this.metadata = props.metadata ?? {};
  }
}

