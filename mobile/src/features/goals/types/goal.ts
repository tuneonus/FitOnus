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

export type GoalCadence = 'once' | 'daily' | 'weekly' | 'streak';
export type GoalDirection = 'increase' | 'decrease' | 'maintain';
export type GoalStatus = 'active' | 'completed' | 'abandoned' | 'paused';

export type Goal = {
  id: string;
  userId?: string | undefined;
  type: GoalType;
  title: string;
  description?: string | null | undefined;
  unit: string;
  start: number;
  current: number;
  target: number;
  progress?: number | undefined;
  cadence: GoalCadence;
  direction?: GoalDirection | undefined;
  status: GoalStatus;
  isPrimary?: boolean | undefined;
  deadline: string;
  targetDate?: string | null | undefined;
  completedOn?: string | null | undefined;
  /** For daily goals: days hit in the last 7. */
  hitDays?: number | undefined;
  history: number[];
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
};

export type GoalCheckpoint = {
  id: string;
  goalId: string;
  value: number;
  date: string;
  recordedAt: string;
  source: string;
  notes: string | null;
};

export type GoalDetails = {
  goal: Goal;
  checkpoints: GoalCheckpoint[];
  recentHistory: number[];
};

export type HabitCategory = 'nutrition' | 'fitness' | 'wellness' | 'mindset' | 'recovery' | 'general';
export type HabitFrequency = 'daily' | 'weekly';

export type Habit = {
  id: string;
  userId?: string | undefined;
  title: string;
  description: string | null;
  category: HabitCategory;
  frequency: HabitFrequency;
  targetDaysPerWeek: number;
  icon: string;
  color: string;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  isCompletedToday: boolean;
  isArchived: boolean;
  weeklyProgress?: {
    completedDays: number;
    targetDays: number;
    percentage: number;
  } | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
};

export type HabitHistory = {
  habit: Habit;
  completionDates: string[];
  streaks: {
    currentStreak: number;
    longestStreak: number;
    totalCompletions: number;
  };
};

export type CreateGoalInput = {
  type: GoalType;
  title?: string | undefined;
  description?: string | null | undefined;
  targetValue: number;
  startValue?: number | undefined;
  metricUnit?: string | undefined;
  cadence?: GoalCadence | undefined;
  direction?: GoalDirection | undefined;
  isPrimary?: boolean | undefined;
  deadlineLabel?: string | undefined;
  targetDate?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type UpdateGoalInput = {
  title?: string | undefined;
  description?: string | null | undefined;
  target?: number | undefined;
  targetValue?: number | undefined;
  currentValue?: number | undefined;
  deadlineLabel?: string | undefined;
  targetDate?: string | null | undefined;
  status?: GoalStatus | undefined;
  isPrimary?: boolean | undefined;
};

export type LogGoalCheckpointInput = {
  value: number;
  date?: string | undefined;
  notes?: string | null | undefined;
  source?: string | undefined;
};

export type CreateHabitInput = {
  title: string;
  description?: string | null | undefined;
  category?: HabitCategory | undefined;
  frequency?: HabitFrequency | undefined;
  targetDaysPerWeek?: number | undefined;
  icon?: string | undefined;
  color?: string | undefined;
};

export type UpdateHabitInput = {
  title?: string | undefined;
  description?: string | null | undefined;
  category?: HabitCategory | undefined;
  frequency?: HabitFrequency | undefined;
  targetDaysPerWeek?: number | undefined;
  icon?: string | undefined;
  color?: string | undefined;
  isArchived?: boolean | undefined;
};

export type SetHabitCompletionInput = {
  id?: string | undefined;
  date: string; // YYYY-MM-DD
  completed: boolean; // Explicit idempotent boolean
  notes?: string | null | undefined;
};
