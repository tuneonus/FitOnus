import { badRequest, notFound } from '../errors.js';
import { calculateGoalProgress } from '../../domain/goal-calculator.js';
import { assertGoalValue } from '../../domain/goal-limits.js';
import type { IGoalRepository } from '../ports.js';

export interface CalculateGoalProgressInput {
  goalId: string;
  userId: string;
  candidateValue?: number;
}

export interface GoalProgressResult {
  goalId: string;
  startValue: number;
  currentValue: number;
  targetValue: number;
  progress: number;
  percentage: number;
  isCompleted: boolean;
}

export class CalculateGoalProgressUseCase {
  constructor(private readonly goalRepo: IGoalRepository) {}

  async execute(input: CalculateGoalProgressInput): Promise<GoalProgressResult> {
    if (!input.goalId) throw badRequest('Goal ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const goal = await this.goalRepo.findById(input.goalId, input.userId);
    if (!goal) {
      throw notFound('Goal not found');
    }

    const valueToCalculate = input.candidateValue !== undefined ? input.candidateValue : goal.currentValue;
    if (valueToCalculate < 0) {
      throw badRequest('Calculation value cannot be negative');
    }
    if (input.candidateValue !== undefined) assertGoalValue('candidateValue', input.candidateValue);

    const progress = calculateGoalProgress({
      start: goal.startValue,
      current: valueToCalculate,
      target: goal.targetValue,
      cadence: goal.cadence,
      direction: goal.direction,
    });

    const isCompleted =
      progress >= 1.0 ||
      (goal.direction === 'decrease' && valueToCalculate <= goal.targetValue) ||
      (goal.direction === 'increase' && valueToCalculate >= goal.targetValue);

    return {
      goalId: goal.id,
      startValue: goal.startValue,
      currentValue: valueToCalculate,
      targetValue: goal.targetValue,
      progress,
      percentage: Math.round(progress * 100),
      isCompleted,
    };
  }
}
