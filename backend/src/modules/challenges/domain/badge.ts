export type BadgeCategory = 'workout' | 'streak' | 'nutrition' | 'strength' | 'milestone' | 'challenge';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'special';

export interface BadgeProps {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  iconName: string;
  pointsValue: number;
  unlockCondition?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Badge {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly category: BadgeCategory;
  readonly tier: BadgeTier;
  readonly iconName: string;
  readonly pointsValue: number;
  readonly unlockCondition: Record<string, unknown>;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: BadgeProps) {
    if (!props.id) throw new Error('Badge id is required');
    if (!props.slug || props.slug.trim().length === 0) throw new Error('Badge slug is required');
    if (!props.name || props.name.trim().length === 0) throw new Error('Badge name is required');
    if (props.pointsValue < 0) throw new Error('Badge pointsValue cannot be negative');

    this.id = props.id;
    this.slug = props.slug.trim().toLowerCase();
    this.name = props.name.trim();
    this.description = props.description;
    this.category = props.category;
    this.tier = props.tier;
    this.iconName = props.iconName || 'medal';
    this.pointsValue = Math.floor(props.pointsValue);
    this.unlockCondition = props.unlockCondition ?? {};
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
