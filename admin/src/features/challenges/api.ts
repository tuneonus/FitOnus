import { apiClient } from '@/lib/api-client';
import type {
  Challenge,
  ListChallengesQuery,
  CreateChallengeInput,
  UpdateChallengeInput,
} from './types';

export const challengesApi = {
  async listChallenges(params: ListChallengesQuery = {}): Promise<Challenge[]> {
    const searchParams = new URLSearchParams();
    if (params.cadence) searchParams.set('cadence', params.cadence);
    if (params.status) searchParams.set('status', params.status);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const res = await apiClient<Challenge[]>(`/challenges${query}`, { method: 'GET' });
    return res.data;
  },

  async getChallenge(challengeId: string): Promise<Challenge> {
    const res = await apiClient<Challenge>(`/challenges/${challengeId}`, { method: 'GET' });
    return res.data;
  },

  async createChallenge(data: CreateChallengeInput): Promise<Challenge> {
    const res = await apiClient<Challenge>('/challenges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateChallenge(challengeId: string, data: UpdateChallengeInput): Promise<Challenge> {
    const res = await apiClient<Challenge>(`/challenges/${challengeId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async publishChallenge(challengeId: string): Promise<Challenge> {
    const res = await apiClient<Challenge>(`/challenges/${challengeId}/publish`, {
      method: 'POST',
    });
    return res.data;
  },

  async archiveChallenge(challengeId: string): Promise<Challenge> {
    const res = await apiClient<Challenge>(`/challenges/${challengeId}/archive`, {
      method: 'POST',
    });
    return res.data;
  },
};

