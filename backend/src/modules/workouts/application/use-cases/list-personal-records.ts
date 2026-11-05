import type { IPersonalRecordRepository } from '../ports.js';
import { toPersonalRecordView, type PersonalRecordView } from '../workout-view.js';

export interface ListPersonalRecordsInput {
  userId: string;
  exerciseId?: string;
  type?: 'current_best' | 'history';
}

export class ListPersonalRecordsUseCase {
  constructor(private readonly prRepo: IPersonalRecordRepository) {}

  async execute(input: ListPersonalRecordsInput): Promise<{ records: PersonalRecordView[] }> {
    if (input.type === 'history' && input.exerciseId) {
      const history = await this.prRepo.listProgressionHistory(input.userId, input.exerciseId);
      return { records: history.map(toPersonalRecordView) };
    }

    const records = await this.prRepo.listCurrentBests(input.userId, input.exerciseId);
    return { records: records.map(toPersonalRecordView) };
  }
}
