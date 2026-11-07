export type ChallengeCadence = 'daily' | 'weekly' | 'monthly' | 'special' | 'custom';

export type ChallengeCategory = 'workout' | 'habit' | 'nutrition' | 'hydration' | 'mixed';

export type ChallengeMetricType =
  | 'workout_count'
  | 'workout_duration_min'
  | 'workout_volume_kg'
  | 'habit_completion_count'
  | 'habit_streak_days'
  | 'water_liters'
  | 'calorie_compliance_days'
  | 'protein_target_days'
  | 'personal_record_count';

export type ChallengeStatus = 'draft' | 'published' | 'archived';

export interface ChallengeProps {
  id: string;
  slug: string;
  title: string;
  description: string;
  cadence: ChallengeCadence;
  category: ChallengeCategory;
  metricType: ChallengeMetricType;
  targetValue: number;
  rewardPoints: number;
  rewardBadgeId?: string | null;
  status: ChallengeStatus;
  autoEnroll: boolean;
  iconName: string;
  bannerColor: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export class Challenge {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly cadence: ChallengeCadence;
  readonly category: ChallengeCategory;
  readonly metricType: ChallengeMetricType;
  readonly targetValue: number;
  readonly rewardPoints: number;
  readonly rewardBadgeId: string | null;
  readonly status: ChallengeStatus;
  readonly autoEnroll: boolean;
  readonly iconName: string;
  readonly bannerColor: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: ChallengeProps) {
    if (!props.id) throw new Error('Challenge id is required');
    if (!props.slug || props.slug.trim().length === 0) throw new Error('Challenge slug is required');
    if (!props.title || props.title.trim().length === 0) throw new Error('Challenge title is required');
    if (props.targetValue <= 0) throw new Error('Challenge targetValue must be greater than 0');
    if (props.rewardPoints < 0) throw new Error('Challenge rewardPoints cannot be negative');

    this.id = props.id;
    this.slug = props.slug.trim().toLowerCase();
    this.title = props.title.trim();
    this.description = props.description;
    this.cadence = props.cadence;
    this.category = props.category;
    this.metricType = props.metricType;
    this.targetValue = props.targetValue;
    this.rewardPoints = Math.floor(props.rewardPoints);
    this.rewardBadgeId = props.rewardBadgeId ?? null;
    this.status = props.status;
    this.autoEnroll = props.autoEnroll ?? true;
    this.iconName = props.iconName || 'trophy';
    this.bannerColor = props.bannerColor || 'teal';
    this.metadata = props.metadata ?? {};
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt ?? null;
  }

  isPublished(): boolean {
    return this.status === 'published' && this.deletedAt === null;
  }

  isRecurring(): boolean {
    return this.cadence === 'daily' || this.cadence === 'weekly' || this.cadence === 'monthly';
  }
}
