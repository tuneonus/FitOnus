import { describe, it, expect } from 'vitest';
import { Goal } from '../../../src/modules/goals/domain/goal.js';
import { GoalCheckpoint } from '../../../src/modules/goals/domain/goal-checkpoint.js';
import { Habit } from '../../../src/modules/goals/domain/habit.js';
import { HabitCompletion } from '../../../src/modules/goals/domain/habit-completion.js';

describe('Goals & Habits Domain Entities', () => {
  describe('Goal Entity', () => {
    it('creates a valid weightLoss goal and calculates initial progress', () => {
      const goal = new Goal({
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        type: 'weightLoss',
        title: 'Reach 75 kg',
        metricUnit: 'kg',
        startValue: 84.2,
        currentValue: 78.4,
        targetValue: 75.0,
        cadence: 'once',
        direction: 'decrease',
        status: 'active',
        isPrimary: true,
        deadlineLabel: 'Jan 31, 2027',
        targetDate: '2027-01-31',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(goal.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(goal.userId).toBe('22222222-2222-4222-8222-222222222222');
      expect(goal.isPrimary).toBe(true);
      expect(goal.progress).toBeCloseTo(0.6304, 3);
      expect(goal.isCompleted).toBe(false);
    });

    it('auto-completes decrease goal when updated currentValue reaches targetValue', () => {
      const goal = new Goal({
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        type: 'weightLoss',
        title: 'Reach 75 kg',
        metricUnit: 'kg',
        startValue: 84.2,
        currentValue: 78.4,
        targetValue: 75.0,
        cadence: 'once',
        direction: 'decrease',
        status: 'active',
        isPrimary: false,
        deadlineLabel: 'Ongoing',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      goal.updateProgress(74.8);
      expect(goal.currentValue).toBe(74.8);
      expect(goal.isCompleted).toBe(true);
      expect(goal.status).toBe('completed');
      expect(goal.completedAt).toBeInstanceOf(Date);
    });

    it('supports reopening a completed goal and updating details', () => {
      const goal = new Goal({
        id: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        type: 'run5k',
        title: 'Run 5K under 30 min',
        metricUnit: 'min',
        startValue: 35.0,
        currentValue: 29.5,
        targetValue: 30.0,
        cadence: 'once',
        direction: 'decrease',
        status: 'completed',
        isPrimary: false,
        deadlineLabel: 'Ongoing',
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(goal.isCompleted).toBe(true);
      goal.reopen();
      expect(goal.isCompleted).toBe(false);
      expect(goal.completedAt).toBeNull();

      goal.updateDetails({ title: 'Run 5K under 28 min', targetValue: 28.0 });
      expect(goal.title).toBe('Run 5K under 28 min');
      expect(goal.targetValue).toBe(28.0);
    });

    it('validates negative input parameters', () => {
      expect(() => {
        new Goal({
          id: '11111111-1111-4111-8111-111111111111',
          userId: '22222222-2222-4222-8222-222222222222',
          type: 'protein',
          title: 'Daily Protein',
          metricUnit: 'g',
          startValue: -10,
          currentValue: 0,
          targetValue: 150,
          cadence: 'daily',
          direction: 'increase',
          status: 'active',
          isPrimary: false,
          deadlineLabel: 'Ongoing',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }).toThrow('Goal values cannot be negative');
    });
  });

  describe('Habit Entity', () => {
    it('creates a valid daily habit and updates streaks', () => {
      const habit = new Habit({
        id: '33333333-3333-4333-8333-333333333333',
        userId: '22222222-2222-4222-8222-222222222222',
        title: 'Drink 500ml water upon waking',
        description: 'First thing in the morning',
        category: 'wellness',
        frequency: 'daily',
        targetDaysPerWeek: 7,
        icon: 'droplets',
        color: 'cyan',
        currentStreak: 5,
        longestStreak: 12,
        totalCompletions: 34,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(habit.title).toBe('Drink 500ml water upon waking');
      expect(habit.category).toBe('wellness');
      expect(habit.frequency).toBe('daily');
      expect(habit.currentStreak).toBe(5);

      habit.updateStreaks(6, 12, 35);
      expect(habit.currentStreak).toBe(6);
      expect(habit.totalCompletions).toBe(35);

      habit.archive();
      expect(habit.isArchived).toBe(true);
      habit.unarchive();
      expect(habit.isArchived).toBe(false);
    });

    it('validates targetDaysPerWeek bounds (1 to 7)', () => {
      expect(() => {
        new Habit({
          id: '33333333-3333-4333-8333-333333333333',
          userId: '22222222-2222-4222-8222-222222222222',
          title: 'Workout',
          category: 'fitness',
          frequency: 'weekly',
          targetDaysPerWeek: 8,
          icon: 'dumbbell',
          color: 'teal',
          currentStreak: 0,
          longestStreak: 0,
          totalCompletions: 0,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }).toThrow('targetDaysPerWeek must be between 1 and 7');
    });
  });

  describe('GoalCheckpoint & HabitCompletion Entities', () => {
    it('creates a goal checkpoint with immutable properties', () => {
      const checkpoint = new GoalCheckpoint({
        id: '44444444-4444-4444-8444-444444444444',
        goalId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        value: 77.9,
        date: '2026-11-06',
        recordedAt: new Date(),
        source: 'weight_log',
        notes: 'Morning weigh-in',
      });

      expect(checkpoint.value).toBe(77.9);
      expect(checkpoint.date).toBe('2026-11-06');
      expect(checkpoint.source).toBe('weight_log');
    });

    it('creates habit completion entity and validates date format', () => {
      const completion = new HabitCompletion({
        id: '55555555-5555-4555-8555-555555555555',
        habitId: '33333333-3333-4333-8333-333333333333',
        userId: '22222222-2222-4222-8222-222222222222',
        date: '2026-11-06',
        completedAt: new Date(),
      });

      expect(completion.habitId).toBe('33333333-3333-4333-8333-333333333333');
      expect(completion.date).toBe('2026-11-06');

      expect(() => {
        new HabitCompletion({
          id: '55555555-5555-4555-8555-555555555555',
          habitId: '33333333-3333-4333-8333-333333333333',
          userId: '22222222-2222-4222-8222-222222222222',
          date: '06-11-2026', // Invalid format
          completedAt: new Date(),
        });
      }).toThrow('Valid date formatted YYYY-MM-DD is required');
    });
  });
});
