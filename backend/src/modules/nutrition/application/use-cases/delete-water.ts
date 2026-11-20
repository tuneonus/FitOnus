import { AppError } from '../../../../shared/errors/app-error.js';
import type { IWaterRepository } from '../ports.js';

export interface DeleteWaterResult {
  id: string;
}

/**
 * Deletes one of the user's water entries.
 *
 * A water entry is a plain append-only log row with no deleted flag, so deletion removes it. The undo is
 * therefore not a restore endpoint: the client logs the same entry again with the same id
 * (`LogWaterUseCase` is idempotent per id, and the id is free again once the row is gone).
 *
 * An entry that does not exist is 404 (a retried delete after success lands here, and clients treat it as
 * "already gone"); another user's entry is 403.
 */
export class DeleteWaterUseCase {
  constructor(private readonly waterRepo: IWaterRepository) {}

  async execute(input: { userId: string; id: string }): Promise<DeleteWaterResult> {
    const entry = await this.waterRepo.findById(input.id);
    if (!entry) throw new AppError('not_found', 'NOT_FOUND', 'Water entry not found');
    if (entry.userId !== input.userId) {
      throw new AppError('forbidden', 'FORBIDDEN', 'Cannot delete a water entry belonging to another user');
    }
    // False means a concurrent request removed it first: the outcome is the same.
    await this.waterRepo.delete(input.id, input.userId);
    return { id: entry.id };
  }
}
