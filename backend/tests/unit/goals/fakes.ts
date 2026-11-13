import {
  Goal,
  type GoalCheckpoint,
  type Habit,
  type IGoalRepository,
  type IGoalsTelemetryPort,
  type IHabitRepository,
  type ProfileGoalsSummary,
  type SetHabitCompletionInput,
  type StreakResult,
} from '../../../src/modules/goals/index.js';

/** Minimal in-memory repositories and a recording telemetry port for deterministic goals/habits tests. */
export class FakeGoalRepository implements IGoalRepository {
  goals = new Map<string, Goal>();
  checkpoints: GoalCheckpoint[] = [];

  async save(goal: Goal): Promise<void> {
    this.goals.set(goal.id, goal);
  }
  async findById(id: string, userId: string): Promise<Goal | null> {
    const goal = this.goals.get(id);
    return goal && goal.userId === userId && goal.deletedAt === null ? goal : null;
  }
  async listByUser(userId: string): Promise<Goal[]> {
    return [...this.goals.values()].filter((g) => g.userId === userId && g.deletedAt === null);
  }
  async delete(): Promise<boolean> {
    return true;
  }
  async addCheckpoint(checkpoint: GoalCheckpoint): Promise<void> {
    this.checkpoints.push(checkpoint);
  }
  async getCheckpoints(goalId: string, userId: string, limit = 20): Promise<GoalCheckpoint[]> {
    return this.checkpoints
      .filter((c) => c.goalId === goalId && c.userId === userId)
      .slice(-limit)
      .reverse();
  }
  async getRecentValues(goalId: string, userId: string, limit = 10): Promise<number[]> {
    return this.checkpoints
      .filter((c) => c.goalId === goalId && c.userId === userId)
      .slice(-limit)
      .map((c) => c.value);
  }
  async clearPrimary(): Promise<void> {}
}

export class FakeHabitRepository implements IHabitRepository {
  habits = new Map<string, Habit>();
  completions = new Map<string, { habitId: string; userId: string; date: string }>();

  async save(habit: Habit): Promise<void> {
    this.habits.set(habit.id, habit);
  }
  async findById(id: string, userId: string): Promise<Habit | null> {
    const habit = this.habits.get(id);
    return habit && habit.userId === userId && habit.deletedAt === null ? habit : null;
  }
  async listByUser(userId: string): Promise<Habit[]> {
    return [...this.habits.values()].filter((h) => h.userId === userId && h.deletedAt === null);
  }
  async delete(): Promise<boolean> {
    return true;
  }
  async setCompletion(input: SetHabitCompletionInput): Promise<boolean> {
    const key = `${input.habitId}:${input.date}`;
    if (input.completed) {
      this.completions.set(key, { habitId: input.habitId, userId: input.userId, date: input.date });
    } else {
      this.completions.delete(key);
    }
    return true;
  }
  async isCompleted(habitId: string, date: string): Promise<boolean> {
    return this.completions.has(`${habitId}:${date}`);
  }
  /** Mirrors PgHabitRepository: the most recent `limit` days, ascending. */
  async getCompletionDates(habitId: string, userId: string, limit = 365): Promise<string[]> {
    const dates = [...this.completions.values()]
      .filter((c) => c.habitId === habitId && c.userId === userId)
      .map((c) => c.date)
      .sort();
    return dates.slice(-limit);
  }
  async getCompletionsForDate(userId: string, date: string): Promise<string[]> {
    return [...this.completions.values()]
      .filter((c) => c.userId === userId && c.date === date)
      .map((c) => c.habitId);
  }
  async updateStreaks(habitId: string, userId: string, streaks: StreakResult): Promise<void> {
    const habit = await this.findById(habitId, userId);
    habit?.updateStreaks(streaks.currentStreak, streaks.longestStreak, streaks.totalCompletions);
  }
}

/** Telemetry port that records the dates/windows it was asked about. */
export class RecordingTelemetryPort implements IGoalsTelemetryPort {
  latestWeight: number | null = 80;
  waterLiters = 2;
  protein = 100;
  weeklyWorkouts = 3;
  workoutStreak = 4;

  waterDates: string[] = [];
  nutritionDates: string[] = [];
  weeklyWindows: { start: Date; end: Date }[] = [];
  streakCalls: { referenceDate?: string; timeZone?: string }[] = [];
  recentWaterRefs: (string | undefined)[] = [];
  recentProteinRefs: (string | undefined)[] = [];

  async getProfileGoals(): Promise<ProfileGoalsSummary | null> {
    return null;
  }
  async getLatestWeight(): Promise<number | null> {
    return this.latestWeight;
  }
  async getDailyWaterIntakeLiters(_userId: string, date: string): Promise<number> {
    this.waterDates.push(date);
    return this.waterLiters;
  }
  async getDailyNutrition(_userId: string, date: string): Promise<{ calories: number; proteinG: number }> {
    this.nutritionDates.push(date);
    return { calories: 2000, proteinG: this.protein };
  }
  async getWeeklyWorkoutCount(_userId: string, weekStart: Date, weekEnd: Date): Promise<number> {
    this.weeklyWindows.push({ start: weekStart, end: weekEnd });
    return this.weeklyWorkouts;
  }
  async getWorkoutStreak(_userId: string, referenceDate?: string, timeZone?: string): Promise<number> {
    this.streakCalls.push({ referenceDate, timeZone });
    return this.workoutStreak;
  }
  async getRecentDailyWaterLiters(_userId: string, days: number, referenceDate?: string): Promise<number[]> {
    this.recentWaterRefs.push(referenceDate);
    return Array.from({ length: days }, () => 2);
  }
  async getRecentDailyProteinGrams(_userId: string, days: number, referenceDate?: string): Promise<number[]> {
    this.recentProteinRefs.push(referenceDate);
    return Array.from({ length: days }, () => 100);
  }
}

export function makeGoal(overrides: Partial<ConstructorParameters<typeof Goal>[0]> = {}): Goal {
  const now = new Date('2026-11-01T00:00:00Z');
  return new Goal({
    id: 'goal-1',
    userId: 'user-1',
    type: 'custom',
    title: 'Test goal',
    metricUnit: 'units',
    startValue: 0,
    currentValue: 0,
    targetValue: 10,
    cadence: 'once',
    direction: 'increase',
    status: 'active',
    isPrimary: false,
    deadlineLabel: 'Ongoing',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}
