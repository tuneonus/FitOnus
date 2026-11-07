import type { IGamificationPointsLedgerRepository } from '../ports.js';
import { toPointsLedgerView, type PointsLedgerView } from '../views.js';

export interface GetPointsHistoryInput {
  userId: string;
  limit?: number;
}

export class GetPointsHistoryUseCase {
  constructor(private readonly ledgerRepo: IGamificationPointsLedgerRepository) {}

  async execute(input: GetPointsHistoryInput): Promise<{ points: PointsLedgerView[] }> {
    const { userId, limit = 50 } = input;
    if (!userId) throw new Error('User ID is required');

    const entries = await this.ledgerRepo.listByUser(userId, limit);
    return { points: entries.map(toPointsLedgerView) };
  }
}
