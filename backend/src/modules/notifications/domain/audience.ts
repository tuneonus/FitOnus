import { AppError } from '../../../shared/errors/app-error.js';
import type { Audience, AudienceFilter, AudienceType } from './notification-policy.js';

export const MAX_AUDIENCE_USERS = 1000;

const invalid = (path: string, message: string): AppError =>
  new AppError('validation', 'VALIDATION_FAILED', 'The audience is invalid.', [
    { location: 'body', path, message },
  ]);

const hasFilter = (filter: AudienceFilter): boolean =>
  (filter.primaryGoal?.length ?? 0) > 0 ||
  (filter.experienceLevel?.length ?? 0) > 0 ||
  filter.onboardingCompleted !== undefined;

/** Canonical audience: irrelevant fields are dropped so an 'all' audience can never carry a stray user list. */
export function normalizeAudience(input: {
  type: AudienceType;
  userIds?: readonly string[] | undefined;
  filter?: AudienceFilter | undefined;
}): Audience {
  switch (input.type) {
    case 'all':
      return { type: 'all', userIds: [], filter: {} };
    case 'users': {
      const userIds = [...new Set((input.userIds ?? []).map((id) => id.toLowerCase()))];
      if (userIds.length === 0) throw invalid('audience.userIds', 'Select at least one user.');
      if (userIds.length > MAX_AUDIENCE_USERS) {
        throw invalid('audience.userIds', `Select at most ${MAX_AUDIENCE_USERS} users.`);
      }
      return { type: 'users', userIds, filter: {} };
    }
    case 'segment': {
      const filter: AudienceFilter = {};
      if (input.filter?.primaryGoal?.length) filter.primaryGoal = [...new Set(input.filter.primaryGoal)];
      if (input.filter?.experienceLevel?.length) {
        filter.experienceLevel = [...new Set(input.filter.experienceLevel)];
      }
      if (input.filter?.onboardingCompleted !== undefined) {
        filter.onboardingCompleted = input.filter.onboardingCompleted;
      }
      // An empty segment would silently mean "everyone"; that must be asked for explicitly as 'all'.
      if (!hasFilter(filter)) throw invalid('audience.filter', 'Choose at least one segment filter.');
      return { type: 'segment', userIds: [], filter };
    }
  }
}
