import { randomUUID } from 'node:crypto';
import { badRequest, notFound } from '../errors.js';
import { GoalCheckpoint } from '../../domain/goal-checkpoint.js';
import type { IGoalRepository } from '../ports.js';
import { toCheckpointView, type GoalCheckpointView } from '../goals-view.js';

export interface GetGoalCheckpointsInput {
  goalId: string;
  userId: string;
  limit?: number;
}

export class GetGoalCheckpointsUseCase {
  constructor(private readonly goalRepo: IGoalRepository) {}

  async execute(input: GetGoalCheckpointsInput): Promise<GoalCheckpointView[]> {
    if (!input.goalId) throw badRequest('Goal ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const goal = await this.goalRepo.findById(input.goalId, input.userId);
    if (!goal) {
      throw notFound('Goal not found');
    }

    const checkpoints = await this.goalRepo.getCheckpoints(input.goalId, input.userId, input.limit ?? 20);
    return checkpoints.map(toCheckpointView);
  }
}

export interface LogGoalCheckpointInput {
  goalId: string;
  userId: string;
  value: number;
  date?: string; // YYYY-MM-DD
  notes?: string | null;
  source?: string;
}

export class LogGoalCheckpointUseCase {
  constructor(private readonly goalRepo: IGoalRepository) {}

  async execute(input: LogGoalCheckpointInput): Promise<GoalCheckpointView> {
    if (!input.goalId) throw badRequest('Goal ID is required');
    if (!input.userId) throw badRequest('User ID is required');
    if (input.value === undefined || input.value === null || input.value < 0) {
      throw badRequest('Checkpoint value must be a non-negative number');
    }

    const goal = await this.goalRepo.findById(input.goalId, input.userId);
    if (!goal) {
      throw notFound('Goal not found');
    }

    const date = input.date ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw badRequest('Date must be formatted as YYYY-MM-DD');
    }

    const checkpoint = new GoalCheckpoint({
      id: randomUUID(),
      goalId: goal.id,
      userId: input.userId,
      value: input.value,
      date,
      recordedAt: new Date(),
      source: input.source ?? 'manual_checkpoint',
      notes: input.notes ?? null,
    });

    await this.goalRepo.addCheckpoint(checkpoint);

    // Update goal's progress to the latest checkpoint value
    goal.updateProgress(input.value);
    await this.goalRepo.save(goal);

    return toCheckpointView(checkpoint);
  }
}
