export type HabitCategory = 'nutrition' | 'fitness' | 'wellness' | 'mindset' | 'recovery' | 'general';
export type HabitFrequency = 'daily' | 'weekly';

export interface HabitProps {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  category: HabitCategory;
  frequency: HabitFrequency;
  targetDaysPerWeek: number;
  icon: string;
  color: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export class Habit {
  private props: HabitProps;

  constructor(props: HabitProps) {
    if (!props.id) throw new Error('Habit ID is required');
    if (!props.userId) throw new Error('User ID is required');
    if (!props.title || props.title.trim().length === 0) throw new Error('Habit title is required');
    if (props.targetDaysPerWeek < 1 || props.targetDaysPerWeek > 7) {
      throw new Error('targetDaysPerWeek must be between 1 and 7');
    }

    this.props = {
      ...props,
      description: props.description ?? null,
      icon: props.icon || 'check',
      color: props.color || 'teal',
      currentStreak: Math.max(0, props.currentStreak || 0),
      longestStreak: Math.max(0, props.longestStreak || 0),
      totalCompletions: Math.max(0, props.totalCompletions || 0),
      isArchived: Boolean(props.isArchived),
      deletedAt: props.deletedAt ?? null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description ?? null;
  }
  get category(): HabitCategory {
    return this.props.category;
  }
  get frequency(): HabitFrequency {
    return this.props.frequency;
  }
  get targetDaysPerWeek(): number {
    return this.props.targetDaysPerWeek;
  }
  get icon(): string {
    return this.props.icon;
  }
  get color(): string {
    return this.props.color;
  }
  get currentStreak(): number {
    return this.props.currentStreak;
  }
  get longestStreak(): number {
    return this.props.longestStreak;
  }
  get totalCompletions(): number {
    return this.props.totalCompletions;
  }
  get isArchived(): boolean {
    return this.props.isArchived;
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

  updateStreaks(currentStreak: number, longestStreak: number, totalCompletions: number): void {
    this.props.currentStreak = Math.max(0, currentStreak);
    this.props.longestStreak = Math.max(this.props.longestStreak, longestStreak);
    this.props.totalCompletions = Math.max(0, totalCompletions);
    this.props.updatedAt = new Date();
  }

  archive(): void {
    this.props.isArchived = true;
    this.props.updatedAt = new Date();
  }

  unarchive(): void {
    this.props.isArchived = false;
    this.props.updatedAt = new Date();
  }

  updateDetails(params: {
    title?: string;
    description?: string | null;
    category?: HabitCategory;
    frequency?: HabitFrequency;
    targetDaysPerWeek?: number;
    icon?: string;
    color?: string;
  }): void {
    if (params.title !== undefined) {
      if (!params.title.trim()) throw new Error('Habit title cannot be empty');
      this.props.title = params.title.trim();
    }
    if (params.description !== undefined) {
      this.props.description = params.description;
    }
    if (params.category !== undefined) {
      this.props.category = params.category;
    }
    if (params.frequency !== undefined) {
      this.props.frequency = params.frequency;
    }
    if (params.targetDaysPerWeek !== undefined) {
      if (params.targetDaysPerWeek < 1 || params.targetDaysPerWeek > 7) {
        throw new Error('targetDaysPerWeek must be between 1 and 7');
      }
      this.props.targetDaysPerWeek = params.targetDaysPerWeek;
    }
    if (params.icon !== undefined) {
      this.props.icon = params.icon;
    }
    if (params.color !== undefined) {
      this.props.color = params.color;
    }
    this.props.updatedAt = new Date();
  }
}
