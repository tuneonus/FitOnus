import { apiClient } from '@/lib/api-client';
import type {
  Challenge,
  ListChallengesQuery,
  CreateChallengeInput,
  UpdateChallengeInput,
  AdminChallengeStats,
  AdminBadge,
  CreateBadgeInput,
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

  async getStats(): Promise<AdminChallengeStats> {
    const res = await apiClient<AdminChallengeStats>('/challenges/stats', {
      method: 'GET',
    });
    return res.data;
  },

  async listBadges(category?: string): Promise<AdminBadge[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await apiClient<AdminBadge[]>(`/challenges/badges${query}`, {
      method: 'GET',
    });
    return res.data;
  },

  async createBadge(data: CreateBadgeInput): Promise<AdminBadge> {
    const res = await apiClient<AdminBadge>('/challenges/badges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deleteBadge(badgeId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient<{ success: boolean; message: string }>(`/challenges/badges/${badgeId}`, {
      method: 'DELETE',
    });
    return res.data;
  },
};

