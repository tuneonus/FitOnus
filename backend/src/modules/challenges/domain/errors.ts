import { AppError } from '../../../shared/errors/app-error.js';

export class ChallengeNotFoundError extends AppError {
  constructor(identifier: string) {
    super('not_found', 'NOT_FOUND', `Challenge not found: ${identifier}`);
  }
}

export class OccurrenceNotFoundError extends AppError {
  constructor(identifier: string) {
    super('not_found', 'NOT_FOUND', `Challenge occurrence not found: ${identifier}`);
  }
}

export class EnrollmentNotFoundError extends AppError {
  constructor(identifier: string) {
    super('not_found', 'NOT_FOUND', `Challenge enrollment not found: ${identifier}`);
  }
}

export class RewardAlreadyClaimedError extends AppError {
  constructor(occurrenceId: string) {
    super('conflict', 'CONFLICT', `Reward for challenge occurrence ${occurrenceId} has already been claimed.`);
  }
}

export class OccurrenceClosedError extends AppError {
  constructor(occurrenceId: string) {
    super('bad_request', 'BAD_REQUEST', `Challenge occurrence ${occurrenceId} is closed or expired.`);
  }
}

export class DuplicateEnrollmentError extends AppError {
  constructor(userId: string, occurrenceId: string) {
    super('conflict', 'CONFLICT', `User ${userId} is already enrolled in challenge occurrence ${occurrenceId}.`);
  }
}

export class IneligibleForRewardError extends AppError {
  constructor(reason: string) {
    super('bad_request', 'BAD_REQUEST', `Ineligible to claim challenge reward: ${reason}`);
  }
}

