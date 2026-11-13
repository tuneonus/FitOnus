import { notFound } from '../errors.js';
import { resolveTimeZone, systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IGoalRepository, IGoalsTelemetryPort } from '../ports.js';
import { toCheckpointView, toGoalView, type GoalDetailsView } from '../goals-view.js';

export interface GetGoalDetailsInput {
  id: string;
  userId: string;
  /** IANA timezone of the user; decides "today" for the recent-days history (UTC when missing/invalid). */
  timezone?: string;
}

export class GetGoalDetailsUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly telemetryPort?: IGoalsTelemetryPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: GetGoalDetailsInput): Promise<GoalDetailsView> {
    const goal = await this.goalRepo.findById(input.id, input.userId);
    if (!goal) {
      throw notFound('Goal not found');
    }

    const checkpoints = await this.goalRepo.getCheckpoints(goal.id, input.userId, 20);
    const timeZone = resolveTimeZone(input.timezone);
    const todayStr = todayInTimeZone(this.clock, timeZone);

    let history: number[] = [];
    let hitDays: number | undefined;

    if (goal.cadence === 'daily' && this.telemetryPort) {
      if (goal.type === 'water') {
        history = await this.telemetryPort.getRecentDailyWaterLiters(input.userId, 7, todayStr);
      } else if (goal.type === 'protein') {
        history = await this.telemetryPort.getRecentDailyProteinGrams(input.userId, 7, todayStr);
      }
      if (history.length > 0) {
        hitDays = history.filter((v) => v >= goal.targetValue).length;
      }
    }

    if (history.length === 0) {
      history = await this.goalRepo.getRecentValues(goal.id, input.userId, 10);
    }

    if (history.length === 0) {
      history = goal.cadence === 'once' ? [goal.startValue, goal.currentValue] : [goal.currentValue];
    }

    return {
      goal: toGoalView(goal, { history, hitDays, timeZone, today: todayStr }),
      checkpoints: checkpoints.map(toCheckpointView),
      recentHistory: history,
    };
  }
}
