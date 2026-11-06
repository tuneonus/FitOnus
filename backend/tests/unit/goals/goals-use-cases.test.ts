import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateGoalUseCase,
  ListGoalsUseCase,
  GetGoalDetailsUseCase,
  UpdateGoalUseCase,
  DeleteGoalUseCase,
  CalculateGoalProgressUseCase,
  GetGoalCheckpointsUseCase,
  LogGoalCheckpointUseCase,
  CreateHabitUseCase,
  ListHabitsUseCase,
  UpdateHabitUseCase,
  DeleteHabitUseCase,
  SetHabitCompletionUseCase,
  CalculateHabitStreaksUseCase,
  GetHabitHistoryUseCase,
  Goal,
  GoalCheckpoint,
  Habit,
  type IGoalRepository,
  type IHabitRepository,
  type IGoalsTelemetryPort,
  type SetHabitCompletionInput,
  type StreakResult,
  type ProfileGoalsSummary,
} from '../../../src/modules/goals/index.js';

class InMemoryGoalRepository implements IGoalRepository {
  goals: Map<string, Goal> = new Map();
  checkpoints: GoalCheckpoint[] = [];

  async save(goal: Goal): Promise<void> {
    this.goals.set(goal.id, goal);
  }

  async findById(id: string, userId: string): Promise<Goal | null> {
    const goal = this.goals.get(id);
    if (!goal || goal.userId !== userId || goal.deletedAt !== null) {
      return null;
    }
    return goal;
  }

  async listByUser(userId: string, filter?: { status?: string; isPrimary?: boolean }): Promise<Goal[]> {
    return Array.from(this.goals.values()).filter((g) => {
      if (g.userId !== userId || g.deletedAt !== null) return false;
      if (filter?.status && g.status !== filter.status) return false;
      if (filter?.isPrimary !== undefined && g.isPrimary !== filter.isPrimary) return false;
      return true;
    });
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const goal = await this.findById(id, userId);
    if (!goal) return false;
    // Simulate soft delete
    const deletedGoal = new Goal({
      id: goal.id,
      userId: goal.userId,
      type: goal.type,
      title: goal.title,
      description: goal.description,
      metricUnit: goal.metricUnit,
      startValue: goal.startValue,
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      cadence: goal.cadence,
      direction: goal.direction,
      status: goal.status,
      isPrimary: goal.isPrimary,
      deadlineLabel: goal.deadlineLabel,
      targetDate: goal.targetDate,
      completedAt: goal.completedAt,
      telemetrySource: goal.telemetrySource,
      metadata: goal.metadata,
      createdAt: goal.createdAt,
      updatedAt: new Date(),
      deletedAt: new Date(),
    });
    this.goals.set(id, deletedGoal);
    return true;
  }

  async addCheckpoint(checkpoint: GoalCheckpoint): Promise<void> {
    this.checkpoints.push(checkpoint);
  }

  async getCheckpoints(goalId: string, userId: string, limit: number = 20): Promise<GoalCheckpoint[]> {
    return this.checkpoints
      .filter((cp) => cp.goalId === goalId && cp.userId === userId)
      .slice(-limit)
      .reverse();
  }

  async getRecentValues(goalId: string, userId: string, limit: number = 10): Promise<number[]> {
    return this.checkpoints
      .filter((cp) => cp.goalId === goalId && cp.userId === userId)
      .slice(-limit)
      .map((cp) => cp.value);
  }

  async clearPrimary(userId: string): Promise<void> {
    for (const goal of this.goals.values()) {
      if (goal.userId === userId && goal.isPrimary) {
        goal.setPrimary(false);
      }
    }
  }
}

class InMemoryHabitRepository implements IHabitRepository {
  habits: Map<string, Habit> = new Map();
  completions: Map<string, { habitId: string; userId: string; date: string; notes?: string | null }> = new Map();

  async save(habit: Habit): Promise<void> {
    this.habits.set(habit.id, habit);
  }

  async findById(id: string, userId: string): Promise<Habit | null> {
    const habit = this.habits.get(id);
    if (!habit || habit.userId !== userId || habit.deletedAt !== null) {
      return null;
    }
    return habit;
  }

  async listByUser(userId: string, filter?: { isArchived?: boolean; category?: string }): Promise<Habit[]> {
    return Array.from(this.habits.values()).filter((h) => {
      if (h.userId !== userId || h.deletedAt !== null) return false;
      if (filter?.isArchived !== undefined && h.isArchived !== filter.isArchived) return false;
      if (filter?.category && h.category !== filter.category) return false;
      return true;
    });
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const habit = await this.findById(id, userId);
    if (!habit) return false;
    const deletedHabit = new Habit({
      id: habit.id,
      userId: habit.userId,
      title: habit.title,
      description: habit.description,
      category: habit.category,
      frequency: habit.frequency,
      targetDaysPerWeek: habit.targetDaysPerWeek,
      icon: habit.icon,
      color: habit.color,
      currentStreak: habit.currentStreak,
      longestStreak: habit.longestStreak,
      totalCompletions: habit.totalCompletions,
      isArchived: habit.isArchived,
      createdAt: habit.createdAt,
      updatedAt: new Date(),
      deletedAt: new Date(),
    });
    this.habits.set(id, deletedHabit);
    return true;
  }

  async setCompletion(input: SetHabitCompletionInput): Promise<boolean> {
    const key = `${input.habitId}:${input.date}`;
    if (input.completed) {
      this.completions.set(key, {
        habitId: input.habitId,
        userId: input.userId,
        date: input.date,
        notes: input.notes,
      });
    } else {
      this.completions.delete(key);
    }
    return true;
  }

  async isCompleted(habitId: string, date: string): Promise<boolean> {
    return this.completions.has(`${habitId}:${date}`);
  }

  async getCompletionDates(habitId: string, userId: string, _limitDays: number = 90): Promise<string[]> {
    const dates: string[] = [];
    for (const c of this.completions.values()) {
      if (c.habitId === habitId && c.userId === userId) {
        dates.push(c.date);
      }
    }
    return dates.sort();
  }

  async getCompletionsForDate(userId: string, date: string): Promise<string[]> {
    const habitIds: string[] = [];
    for (const c of this.completions.values()) {
      if (c.userId === userId && c.date === date) {
        habitIds.push(c.habitId);
      }
    }
    return habitIds;
  }

  async updateStreaks(habitId: string, userId: string, streaks: StreakResult): Promise<void> {
    const habit = await this.findById(habitId, userId);
    if (habit) {
      habit.updateStreaks(streaks.currentStreak, streaks.longestStreak, streaks.totalCompletions);
    }
  }
}

class MockTelemetryPort implements IGoalsTelemetryPort {
  latestWeight: number | null = 82.5;
  waterIntake: number = 2.5;
  nutrition: { calories: number; proteinG: number } = { calories: 2200, proteinG: 140 };
  weeklyWorkouts: number = 4;
  workoutStreak: number = 5;

  async getProfileGoals(_userId: string): Promise<ProfileGoalsSummary | null> {
    return {
      primaryGoal: 'lose_weight',
      targetWeightKg: 75,
      startingWeightKg: 85,
      currentWeightKg: 82.5,
      dailyCalorieTarget: 2000,
      dailyProteinGrams: 150,
      workoutDaysPerWeek: 4,
    };
  }

  async getLatestWeight(_userId: string): Promise<number | null> {
    return this.latestWeight;
  }

  async getDailyWaterIntakeLiters(_userId: string, _date: string): Promise<number> {
    return this.waterIntake;
  }

  async getDailyNutrition(_userId: string, _date: string): Promise<{ calories: number; proteinG: number }> {
    return this.nutrition;
  }

  async getWeeklyWorkoutCount(_userId: string, _weekStart: Date, _weekEnd: Date): Promise<number> {
    return this.weeklyWorkouts;
  }

  async getWorkoutStreak(_userId: string, _referenceDateStr?: string): Promise<number> {
    return this.workoutStreak;
  }

  async getRecentDailyWaterLiters(_userId: string, days: number): Promise<number[]> {
    return Array.from({ length: days }, () => 2.5);
  }

  async getRecentDailyProteinGrams(_userId: string, days: number): Promise<number[]> {
    return Array.from({ length: days }, () => 140);
  }
}

describe('Goals & Habits Application Use Cases', () => {
  let goalRepo: InMemoryGoalRepository;
  let habitRepo: InMemoryHabitRepository;
  let telemetryPort: MockTelemetryPort;
  const userId = 'usr_test_123';

  beforeEach(() => {
    goalRepo = new InMemoryGoalRepository();
    habitRepo = new InMemoryHabitRepository();
    telemetryPort = new MockTelemetryPort();
  });

  // 1. Create Goal
  describe('CreateGoalUseCase', () => {
    it('creates goal and records baseline checkpoint', async () => {
      const useCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const result = await useCase.execute({
        userId,
        type: 'weightLoss',
        targetValue: 75.0,
      });

      expect(result.id).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.type).toBe('weightLoss');
      expect(result.start).toBe(82.5); // auto-seeded from telemetry latest weight
      expect(result.target).toBe(75.0);
      expect(result.current).toBe(82.5);

      const checkpoints = await goalRepo.getCheckpoints(result.id, userId);
      expect(checkpoints.length).toBe(1);
      expect(checkpoints[0]!.source).toBe('initial_baseline');
      expect(checkpoints[0]!.value).toBe(82.5);
    });

    it('validates target value cannot be negative', async () => {
      const useCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      await expect(
        useCase.execute({
          userId,
          type: 'weightLoss',
          targetValue: -5,
        }),
      ).rejects.toThrow('Target value must be a non-negative number');
    });

    it('supports workoutFrequency weekly goals', async () => {
      const useCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const result = await useCase.execute({
        userId,
        type: 'workoutFrequency',
        targetValue: 4,
      });

      expect(result.type).toBe('workoutFrequency');
      expect(result.cadence).toBe('weekly');
      expect(result.unit).toBe('sessions');
    });
  });

  // 2. List Goals
  describe('ListGoalsUseCase', () => {
    it('lists goals and syncs live telemetry', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      await createUseCase.execute({
        userId,
        type: 'water',
        targetValue: 3.0,
      });

      const listUseCase = new ListGoalsUseCase(goalRepo, telemetryPort);
      const list = await listUseCase.execute({ userId, syncTelemetry: true });

      expect(list.length).toBe(1);
      expect(list[0]!.type).toBe('water');
      expect(list[0]!.current).toBe(2.5); // Synced from telemetryPort.waterIntake
      expect(list[0]!.history.length).toBe(7);
    });

    it('filters by status and isPrimary', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      await createUseCase.execute({
        userId,
        type: 'weightLoss',
        targetValue: 75,
        isPrimary: true,
      });
      await createUseCase.execute({
        userId,
        type: 'protein',
        targetValue: 150,
        isPrimary: false,
      });

      const listUseCase = new ListGoalsUseCase(goalRepo, telemetryPort);
      const primaryOnly = await listUseCase.execute({ userId, isPrimary: true, syncTelemetry: false });
      expect(primaryOnly.length).toBe(1);
      expect(primaryOnly[0]!.type).toBe('weightLoss');
    });
  });

  // 3. Get Goal Details
  describe('GetGoalDetailsUseCase', () => {
    it('returns goal with checkpoints and recent history', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const created = await createUseCase.execute({
        userId,
        type: 'weightLoss',
        targetValue: 75,
      });

      const detailsUseCase = new GetGoalDetailsUseCase(goalRepo, telemetryPort);
      const details = await detailsUseCase.execute({ id: created.id, userId });

      expect(details.goal.id).toBe(created.id);
      expect(details.checkpoints.length).toBe(1);
      expect(details.recentHistory.length).toBeGreaterThanOrEqual(1);
    });

    it('throws 404 for non-existent or other user goal', async () => {
      const detailsUseCase = new GetGoalDetailsUseCase(goalRepo, telemetryPort);
      await expect(detailsUseCase.execute({ id: 'non-existent', userId })).rejects.toThrow('Goal not found');
    });
  });

  // 4. Update Goal
  describe('UpdateGoalUseCase', () => {
    it('updates details, sets progress, and records manual checkpoint', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const created = await createUseCase.execute({
        userId,
        type: 'weightLoss',
        targetValue: 75,
        startValue: 85,
      });

      const updateUseCase = new UpdateGoalUseCase(goalRepo);
      const updated = await updateUseCase.execute({
        id: created.id,
        userId,
        currentValue: 80,
        title: 'New Title',
      });

      expect(updated.current).toBe(80);
      expect(updated.title).toBe('New Title');

      const checkpoints = await goalRepo.getCheckpoints(created.id, userId);
      expect(checkpoints.length).toBe(2); // baseline + manual_update
      expect(checkpoints[0]!.source).toBe('manual_update');
      expect(checkpoints[0]!.value).toBe(80);
    });

    it('handles status transitions', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const created = await createUseCase.execute({
        userId,
        type: 'weightLoss',
        targetValue: 75,
      });

      const updateUseCase = new UpdateGoalUseCase(goalRepo);
      const completed = await updateUseCase.execute({
        id: created.id,
        userId,
        status: 'completed',
      });

      expect(completed.status).toBe('completed');
    });
  });

  // 5. Delete Goal
  describe('DeleteGoalUseCase', () => {
    it('soft deletes existing goal', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const created = await createUseCase.execute({
        userId,
        type: 'water',
        targetValue: 3.0,
      });

      const deleteUseCase = new DeleteGoalUseCase(goalRepo);
      const result = await deleteUseCase.execute({ id: created.id, userId });
      expect(result.success).toBe(true);

      const found = await goalRepo.findById(created.id, userId);
      expect(found).toBeNull();
    });

    it('throws 404 when deleting missing goal', async () => {
      const deleteUseCase = new DeleteGoalUseCase(goalRepo);
      await expect(deleteUseCase.execute({ id: 'ghost_id', userId })).rejects.toThrow('Goal not found');
    });
  });

  // 6. Calculate Goal Progress
  describe('CalculateGoalProgressUseCase', () => {
    it('calculates deterministic progress and checks completion', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const created = await createUseCase.execute({
        userId,
        type: 'weightLoss',
        startValue: 90,
        targetValue: 80,
      });

      const calcUseCase = new CalculateGoalProgressUseCase(goalRepo);
      // Halfway: current = 85 -> 50%
      const half = await calcUseCase.execute({
        goalId: created.id,
        userId,
        candidateValue: 85,
      });

      expect(half.progress).toBe(0.5);
      expect(half.percentage).toBe(50);
      expect(half.isCompleted).toBe(false);

      // Reached: current = 80 -> 100%
      const complete = await calcUseCase.execute({
        goalId: created.id,
        userId,
        candidateValue: 80,
      });

      expect(complete.progress).toBe(1.0);
      expect(complete.percentage).toBe(100);
      expect(complete.isCompleted).toBe(true);
    });
  });

  // 7. Checkpoints
  describe('Goal Checkpoints Use Cases', () => {
    it('logs a new checkpoint and updates goal current value', async () => {
      const createUseCase = new CreateGoalUseCase(goalRepo, telemetryPort);
      const created = await createUseCase.execute({
        userId,
        type: 'weightLoss',
        targetValue: 70,
        startValue: 85,
      });

      const logUseCase = new LogGoalCheckpointUseCase(goalRepo);
      const checkpoint = await logUseCase.execute({
        goalId: created.id,
        userId,
        value: 82.0,
        date: '2026-11-06',
        notes: 'Weigh-in after morning run',
      });

      expect(checkpoint.value).toBe(82.0);
      expect(checkpoint.notes).toBe('Weigh-in after morning run');

      const getUseCase = new GetGoalCheckpointsUseCase(goalRepo);
      const checkpoints = await getUseCase.execute({ goalId: created.id, userId });
      expect(checkpoints.length).toBe(2);

      const updatedGoal = await goalRepo.findById(created.id, userId);
      expect(updatedGoal?.currentValue).toBe(82.0);
    });
  });

  // 8. Create Habit
  describe('CreateHabitUseCase', () => {
    it('creates daily habit with default 7 target days', async () => {
      const useCase = new CreateHabitUseCase(habitRepo);
      const habit = await useCase.execute({
        userId,
        title: 'Morning Sunlight',
        category: 'wellness',
      });

      expect(habit.title).toBe('Morning Sunlight');
      expect(habit.frequency).toBe('daily');
      expect(habit.targetDaysPerWeek).toBe(7);
      expect(habit.currentStreak).toBe(0);
      expect(habit.isCompletedToday).toBe(false);
    });

    it('creates weekly habit with default 3 target days', async () => {
      const useCase = new CreateHabitUseCase(habitRepo);
      const habit = await useCase.execute({
        userId,
        title: 'Long Run',
        category: 'fitness',
        frequency: 'weekly',
      });

      expect(habit.frequency).toBe('weekly');
      expect(habit.targetDaysPerWeek).toBe(3);
    });

    it('rejects invalid target days', async () => {
      const useCase = new CreateHabitUseCase(habitRepo);
      await expect(
        useCase.execute({
          userId,
          title: 'Stretch',
          targetDaysPerWeek: 10,
        }),
      ).rejects.toThrow('Target days per week must be between 1 and 7');
    });
  });

  // 9. List Habits
  describe('ListHabitsUseCase', () => {
    it('lists habits and reports completed status for today', async () => {
      const createUseCase = new CreateHabitUseCase(habitRepo);
      const h1 = await createUseCase.execute({ userId, title: 'Meditate' });
      await createUseCase.execute({ userId, title: 'Cold Shower' });

      const today = '2026-11-06';
      // Mark h1 completed today
      await habitRepo.setCompletion({
        habitId: h1.id,
        userId,
        date: today,
        completed: true,
      });

      const listUseCase = new ListHabitsUseCase(habitRepo);
      const list = await listUseCase.execute({ userId, date: today });

      expect(list.length).toBe(2);
      const foundH1 = list.find((h) => h.id === h1.id);
      expect(foundH1?.isCompletedToday).toBe(true);
      expect(foundH1?.weeklyProgress?.completedDays).toBe(1);
    });
  });

  // 10. Update Habit
  describe('UpdateHabitUseCase', () => {
    it('updates habit details and archives habit', async () => {
      const createUseCase = new CreateHabitUseCase(habitRepo);
      const created = await createUseCase.execute({ userId, title: 'Read Book' });

      const updateUseCase = new UpdateHabitUseCase(habitRepo);
      const updated = await updateUseCase.execute({
        id: created.id,
        userId,
        title: 'Read 20 Pages',
        targetDaysPerWeek: 5,
        isArchived: true,
      });

      expect(updated.title).toBe('Read 20 Pages');
      expect(updated.targetDaysPerWeek).toBe(5);
      expect(updated.isArchived).toBe(true);
    });
  });

  // 11. Delete Habit
  describe('DeleteHabitUseCase', () => {
    it('soft deletes habit', async () => {
      const createUseCase = new CreateHabitUseCase(habitRepo);
      const created = await createUseCase.execute({ userId, title: 'Floss' });

      const deleteUseCase = new DeleteHabitUseCase(habitRepo);
      const result = await deleteUseCase.execute({ id: created.id, userId });
      expect(result.success).toBe(true);

      const found = await habitRepo.findById(created.id, userId);
      expect(found).toBeNull();
    });
  });

  // 12. Set Habit Completion (Explicit Idempotent State)
  describe('SetHabitCompletionUseCase', () => {
    it('sets completion to true idempotently and calculates streaks', async () => {
      const createUseCase = new CreateHabitUseCase(habitRepo);
      const habit = await createUseCase.execute({ userId, title: 'Drink Water' });

      const completeUseCase = new SetHabitCompletionUseCase(habitRepo);

      // Day 1
      await completeUseCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-04',
        completed: true,
      });

      // Day 2
      await completeUseCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-05',
        completed: true,
      });

      // Day 3
      const res = await completeUseCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-06',
        completed: true,
      });

      expect(res.completed).toBe(true);
      expect(res.streaks.currentStreak).toBe(3);
      expect(res.streaks.longestStreak).toBe(3);
      expect(res.streaks.totalCompletions).toBe(3);

      // Repeat Day 3 (offline retry idempotency check) - should NOT duplicate or invert
      const retry = await completeUseCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-06',
        completed: true,
      });
      expect(retry.streaks.currentStreak).toBe(3);
      expect(retry.streaks.totalCompletions).toBe(3);
    });

    it('unmarks completion when completed=false explicitly and recomputes streaks', async () => {
      const createUseCase = new CreateHabitUseCase(habitRepo);
      const habit = await createUseCase.execute({ userId, title: 'Journal' });

      const completeUseCase = new SetHabitCompletionUseCase(habitRepo);

      await completeUseCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-06',
        completed: true,
      });

      // Now undo
      const undoRes = await completeUseCase.execute({
        habitId: habit.id,
        userId,
        date: '2026-11-06',
        completed: false,
      });

      expect(undoRes.completed).toBe(false);
      expect(undoRes.streaks.currentStreak).toBe(0);
      expect(undoRes.streaks.totalCompletions).toBe(0);
    });
  });

  // 13. Calculate Daily / Weekly Streaks
  describe('CalculateHabitStreaksUseCase', () => {
    it('calculates weekly streaks correctly for weekly habit', async () => {
      const createUseCase = new CreateHabitUseCase(habitRepo);
      const habit = await createUseCase.execute({
        userId,
        title: 'Gym Session',
        frequency: 'weekly',
        targetDaysPerWeek: 3,
      });

      // Add 3 completions in week 1 and 3 completions in week 2
      // Week 1 (Oct 20-26, 2026): 2026-10-20, 2026-10-22, 2026-10-24
      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-10-20', completed: true });
      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-10-22', completed: true });
      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-10-24', completed: true });

      // Week 2 (Oct 27 - Nov 02, 2026): 2026-10-27, 2026-10-29, 2026-10-31
      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-10-27', completed: true });
      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-10-29', completed: true });
      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-10-31', completed: true });

      const streakUseCase = new CalculateHabitStreaksUseCase(habitRepo);
      const streaks = await streakUseCase.execute({
        habitId: habit.id,
        userId,
        referenceDate: '2026-11-01',
      });

      expect(streaks.currentStreak).toBe(2);
      expect(streaks.longestStreak).toBe(2);
      expect(streaks.totalCompletions).toBe(6);
    });
  });

  // 14. Get Habit History
  describe('GetHabitHistoryUseCase', () => {
    it('returns habit with completion history and streaks', async () => {
      const createUseCase = new CreateHabitUseCase(habitRepo);
      const habit = await createUseCase.execute({ userId, title: 'Yoga' });

      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-11-05', completed: true });
      await habitRepo.setCompletion({ habitId: habit.id, userId, date: '2026-11-06', completed: true });

      const historyUseCase = new GetHabitHistoryUseCase(habitRepo);
      const history = await historyUseCase.execute({ habitId: habit.id, userId });

      expect(history.habit.id).toBe(habit.id);
      expect(history.completionDates).toEqual(['2026-11-05', '2026-11-06']);
      expect(history.streaks.totalCompletions).toBe(2);
    });

    it('throws 404 for missing habit', async () => {
      const historyUseCase = new GetHabitHistoryUseCase(habitRepo);
      await expect(historyUseCase.execute({ habitId: 'missing', userId })).rejects.toThrow('Habit not found');
    });
  });
});
