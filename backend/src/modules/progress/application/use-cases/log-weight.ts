import { AppError } from '../../../../shared/errors/app-error.js';
import { WeightLog, type WeightSource } from '../../domain/weight-log.js';
import type { IWeightRepository } from '../ports.js';

export interface LogWeightInput {
  userId: string;
  weightKg: number;
  loggedAt?: Date;
  source?: WeightSource;
  notes?: string | null;
  clientId?: string | null;
}

export interface LogWeightResult {
  log: WeightLog;
  isNew: boolean;
  currentWeight: number;
  startingWeight: number | null;
  changeFromStart: number;
  changeFromPrevious: number;
}

export class LogWeightUseCase {
  constructor(private readonly weightRepo: IWeightRepository) {}

  async execute(input: LogWeightInput): Promise<LogWeightResult> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const id = crypto.randomUUID();
    const loggedAt = input.loggedAt ?? new Date();

    const weightLog = new WeightLog({
      id,
      userId: input.userId,
      weightKg: input.weightKg,
      loggedAt,
      source: input.source ?? 'manual',
      notes: input.notes,
      clientId: input.clientId,
    });

    // Save with idempotency
    const { log, isNew } = await this.weightRepo.save(weightLog);

    // Fetch refreshed summary
    const summary = await this.weightRepo.getUserWeightSummary(input.userId);
    const currentWeight = summary.currentWeightKg ?? log.weightKg;
    const startingWeight = summary.startingWeightKg;

    // Change from starting weight
    const changeFromStart =
      startingWeight !== null ? Math.round((currentWeight - startingWeight) * 10) / 10 : 0;

    // Change from immediate previous entry
    const allRecent = await this.weightRepo.listForUser(input.userId, { limit: 2 });
    let changeFromPrevious = 0;
    if (allRecent.logs.length >= 2) {
      const prev = allRecent.logs[1]!;
      changeFromPrevious = Math.round((currentWeight - prev.weightKg) * 10) / 10;
    }

    return {
      log,
      isNew,
      currentWeight,
      startingWeight,
      changeFromStart,
      changeFromPrevious,
    };
  }
}
