import { randomUUID } from 'node:crypto';
import { badRequest, notFound } from '../errors.js';
import { GoalCheckpoint } from '../../domain/goal-checkpoint.js';
import type { GoalStatus } from '../../domain/goal.js';
import {
  GOAL_DEADLINE_LABEL_MAX_LENGTH,
  GOAL_TITLE_MAX_LENGTH,
  assertCalendarDate,
  assertGoalValue,
  assertMaxLength,
} from '../../domain/goal-limits.js';
import { systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IGoalRepository } from '../ports.js';
import { toGoalView, type GoalView } from '../goals-view.js';

export interface UpdateGoalInput {
  id: string;
  userId: string;
  title?: string;
  description?: string | null;
  targetValue?: number;
  currentValue?: number;
  deadlineLabel?: string;
  targetDate?: string | null;
  status?: GoalStatus;
  isPrimary?: boolean;
  /** IANA timezone of the user; decides the calendar day of the progress checkpoint (UTC when missing/invalid). */
  timezone?: string;
}

export class UpdateGoalUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: UpdateGoalInput): Promise<GoalView> {
    if (!input.id) throw badRequest('Goal ID is required');
    if (!input.userId) throw badRequest('User ID is required');

    const goal = await this.goalRepo.findById(input.id, input.userId);
    if (!goal) {
      throw notFound('Goal not found');
    }

    if (input.targetValue !== undefined && input.targetValue < 0) {
      throw badRequest('Target value cannot be negative');
    }
    if (input.currentValue !== undefined && input.currentValue < 0) {
      throw badRequest('Current value cannot be negative');
    }
    // Only values being written are checked; untouched legacy values stay editable.
    if (input.targetValue !== undefined) assertGoalValue('targetValue', input.targetValue);
    if (input.currentValue !== undefined) assertGoalValue('currentValue', input.currentValue);
    assertCalendarDate('targetDate', input.targetDate);
    assertMaxLength('title', input.title?.trim(), GOAL_TITLE_MAX_LENGTH);
    assertMaxLength('deadlineLabel', input.deadlineLabel, GOAL_DEADLINE_LABEL_MAX_LENGTH);

    const today = todayInTimeZone(this.clock, input.timezone);

    // Handle primary status change
    if (input.isPrimary === true && !goal.isPrimary) {
      await this.goalRepo.clearPrimary(input.userId);
      goal.setPrimary(true);
    } else if (input.isPrimary === false && goal.isPrimary) {
      goal.setPrimary(false);
    }

    // Update basic details
    goal.updateDetails({
      title: input.title,
      description: input.description,
      targetValue: input.targetValue,
      deadlineLabel: input.deadlineLabel,
      targetDate: input.targetDate,
    });

    // Update progress / current value if provided and changed
    if (input.currentValue !== undefined && input.currentValue !== goal.currentValue) {
      goal.updateProgress(input.currentValue, this.clock());

      // Record a checkpoint for progress change
      const checkpoint = new GoalCheckpoint({
        id: randomUUID(),
        goalId: goal.id,
        userId: input.userId,
        value: input.currentValue,
        date: today,
        recordedAt: this.clock(),
        source: 'manual_update',
        notes: 'Manual progress update',
      });
      await this.goalRepo.addCheckpoint(checkpoint);
    }

    // Handle status change
    if (input.status !== undefined) {
      goal.setStatus(input.status);
    }

    await this.goalRepo.save(goal);

    const history = await this.goalRepo.getRecentValues(goal.id, input.userId, 10);
    const resolvedHistory = history.length > 0 ? history : [goal.startValue, goal.currentValue];

    return toGoalView(goal, { history: resolvedHistory, timeZone: input.timezone, today });
  }
}
