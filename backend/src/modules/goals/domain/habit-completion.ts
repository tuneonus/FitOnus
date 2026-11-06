export interface HabitCompletionProps {
  id: string;
  habitId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  completedAt: Date;
  notes?: string | null;
}

export class HabitCompletion {
  private props: HabitCompletionProps;

  constructor(props: HabitCompletionProps) {
    if (!props.id) throw new Error('Completion ID is required');
    if (!props.habitId) throw new Error('Habit ID is required');
    if (!props.userId) throw new Error('User ID is required');
    if (!props.date || !/^\d{4}-\d{2}-\d{2}$/.test(props.date)) {
      throw new Error('Valid date formatted YYYY-MM-DD is required');
    }

    this.props = {
      ...props,
      notes: props.notes ?? null,
    };
  }

  get id(): string {
    return this.props.id;
  }
  get habitId(): string {
    return this.props.habitId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get date(): string {
    return this.props.date;
  }
  get completedAt(): Date {
    return this.props.completedAt;
  }
  get notes(): string | null {
    return this.props.notes ?? null;
  }
}
