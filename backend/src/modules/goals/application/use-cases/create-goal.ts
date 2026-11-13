import { randomUUID } from 'node:crypto';
import { badRequest } from '../errors.js';
import {
  Goal,
  type GoalCadence,
  type GoalDirection,
  type GoalType,
  type TelemetrySource,
} from '../../domain/goal.js';
import { GoalCheckpoint } from '../../domain/goal-checkpoint.js';
import {
  GOAL_DEADLINE_LABEL_MAX_LENGTH,
  GOAL_METRIC_UNIT_MAX_LENGTH,
  GOAL_TITLE_MAX_LENGTH,
  assertCalendarDate,
  assertGoalValue,
  assertMaxLength,
} from '../../domain/goal-limits.js';
import { systemClock, todayInTimeZone, type Clock } from '../../domain/local-date.js';
import type { IGoalRepository, IGoalsTelemetryPort } from '../ports.js';
import { toGoalView, type GoalView } from '../goals-view.js';

export interface CreateGoalInput {
  id?: string;
  userId: string;
  type: GoalType;
  title?: string;
  description?: string | null;
  targetValue: number;
  startValue?: number;
  metricUnit?: string;
  cadence?: GoalCadence;
  direction?: GoalDirection;
  isPrimary?: boolean;
  deadlineLabel?: string;
  targetDate?: string | null; // YYYY-MM-DD
  telemetrySource?: TelemetrySource | null;
  metadata?: Record<string, unknown>;
  /** IANA timezone of the user; decides the calendar day of the baseline checkpoint (UTC when missing/invalid). */
  timezone?: string;
}

interface GoalTypeDefaults {
  unit: string;
  cadence: GoalCadence;
  direction: GoalDirection;
  telemetry: TelemetrySource | null;
  defaultTitle: string;
}

const TYPE_DEFAULTS: Record<GoalType, GoalTypeDefaults> = {
  weightLoss: {
    unit: 'kg',
    cadence: 'once',
    direction: 'decrease',
    telemetry: 'weight_logs',
    defaultTitle: 'Lose weight',
  },
  muscleGain: {
    unit: 'kg lean',
    cadence: 'once',
    direction: 'increase',
    telemetry: 'weight_logs',
    defaultTitle: 'Gain muscle',
  },
  maintain: {
    unit: 'kg',
    cadence: 'once',
    direction: 'maintain',
    telemetry: 'weight_logs',
    defaultTitle: 'Maintain weight',
  },
  run5k: { unit: 'min', cadence: 'once', direction: 'decrease', telemetry: 'manual', defaultTitle: 'Run 5K' },
  run10k: {
    unit: 'min',
    cadence: 'once',
    direction: 'decrease',
    telemetry: 'manual',
    defaultTitle: 'Run 10K',
  },
  marathon: {
    unit: 'hrs',
    cadence: 'once',
    direction: 'decrease',
    telemetry: 'manual',
    defaultTitle: 'Marathon',
  },
  steps: {
    unit: 'steps',
    cadence: 'daily',
    direction: 'increase',
    telemetry: 'manual',
    defaultTitle: 'Daily steps',
  },
  water: {
    unit: 'L',
    cadence: 'daily',
    direction: 'increase',
    telemetry: 'water_intake',
    defaultTitle: 'Water intake',
  },
  protein: {
    unit: 'g',
    cadence: 'daily',
    direction: 'increase',
    telemetry: 'nutrition_meals',
    defaultTitle: 'Protein intake',
  },
  streak: {
    unit: 'days',
    cadence: 'streak',
    direction: 'increase',
    telemetry: 'workout_sessions',
    defaultTitle: 'Workout streak',
  },
  workoutFrequency: {
    unit: 'sessions',
    cadence: 'weekly',
    direction: 'increase',
    telemetry: 'workout_sessions',
    defaultTitle: 'Weekly workout frequency',
  },
  custom: {
    unit: 'units',
    cadence: 'once',
    direction: 'increase',
    telemetry: 'manual',
    defaultTitle: 'Custom goal',
  },
};

export class CreateGoalUseCase {
  constructor(
    private readonly goalRepo: IGoalRepository,
    private readonly telemetryPort?: IGoalsTelemetryPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(input: CreateGoalInput): Promise<GoalView> {
    if (!input.userId) throw badRequest('User ID is required');
    if (input.targetValue === undefined || input.targetValue === null || input.targetValue < 0) {
      throw badRequest('Target value must be a non-negative number');
    }
    assertGoalValue('targetValue', input.targetValue);
    assertCalendarDate('targetDate', input.targetDate);

    const typeDefaults = TYPE_DEFAULTS[input.type] ?? TYPE_DEFAULTS.custom;
    const cadence = input.cadence ?? typeDefaults.cadence;
    const direction = input.direction ?? typeDefaults.direction;
    const metricUnit = input.metricUnit ?? typeDefaults.unit;
    const telemetrySource = input.telemetrySource ?? typeDefaults.telemetry;

    // Resolve start value (auto-seed from telemetry if not provided)
    let startValue = input.startValue;
    if (startValue === undefined || startValue === null) {
      startValue = await this.resolveStartValue(input.userId, input.type);
    }
    if (startValue < 0) startValue = 0;
    assertGoalValue('startValue', startValue);

    const title = input.title?.trim() || `${typeDefaults.defaultTitle} · ${input.targetValue} ${metricUnit}`;
    const isPrimary = Boolean(input.isPrimary);
    const deadlineLabel = input.deadlineLabel ?? 'Ongoing';
    assertMaxLength('title', title, GOAL_TITLE_MAX_LENGTH);
    assertMaxLength('metricUnit', metricUnit, GOAL_METRIC_UNIT_MAX_LENGTH);
    assertMaxLength('deadlineLabel', deadlineLabel, GOAL_DEADLINE_LABEL_MAX_LENGTH);

    const now = this.clock();
    const today = todayInTimeZone(this.clock, input.timezone);

    const goal = new Goal({
      id: input.id ?? randomUUID(),
      userId: input.userId,
      type: input.type,
      title,
      description: input.description ?? null,
      metricUnit,
      startValue,
      currentValue: cadence === 'once' ? startValue : 0,
      targetValue: input.targetValue,
      cadence,
      direction,
      status: 'active',
      isPrimary,
      deadlineLabel,
      targetDate: input.targetDate ?? null,
      telemetrySource,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });

    await this.goalRepo.save(goal);

    // Add baseline checkpoint
    const initialCheckpoint = new GoalCheckpoint({
      id: randomUUID(),
      goalId: goal.id,
      userId: input.userId,
      value: startValue,
      date: today,
      recordedAt: now,
      source: 'initial_baseline',
      notes: 'Initial goal creation baseline',
    });
    await this.goalRepo.addCheckpoint(initialCheckpoint);

    return toGoalView(goal, { history: [startValue], timeZone: input.timezone, today });
  }

  private async resolveStartValue(userId: string, type: GoalType): Promise<number> {
    if (!this.telemetryPort) return 0;

    if (type === 'weightLoss' || type === 'maintain' || type === 'muscleGain') {
      const latestWeight = await this.telemetryPort.getLatestWeight(userId);
      if (latestWeight !== null && latestWeight > 0) return latestWeight;

      const profile = await this.telemetryPort.getProfileGoals(userId);
      if (profile?.currentWeightKg) return profile.currentWeightKg;
      if (profile?.startingWeightKg) return profile.startingWeightKg;
      return type === 'muscleGain' ? 35.0 : 80.0;
    }

    if (type === 'run5k') return 35.0;
    if (type === 'run10k') return 65.0;
    if (type === 'marathon') return 5.0;

    return 0;
  }
}
