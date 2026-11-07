import { apiClient } from '@/services/api-client';
import { logger } from '@/utils/logger';
import type {
  ActiveChallengeItemView,
  BadgeView,
  ChallengeEnrollmentView,
  ClaimRewardResult,
  GamificationProfileView,
  GetChallengeHistoryParams,
  GetChallengesParams,
  GetPointsHistoryParams,
  PointsLedgerView,
} from '../types/challenges';

export const challengesApi = {
  // =========================================================================
  // Member Challenges Endpoints
  // =========================================================================

  /**
   * Fetch all active challenges with current occurrence and user progress.
   */
  async getActiveChallenges(params?: GetChallengesParams): Promise<ActiveChallengeItemView[]> {
    try {
      const res = await apiClient.get('/challenges', { params });
      return res.data?.data ?? [];
    } catch (err) {
      logger.error('Failed to fetch active challenges:', err);
      throw err;
    }
  },

  /**
   * Fetch authenticated user's challenge participation history.
   */
  async getChallengeHistory(params?: GetChallengeHistoryParams): Promise<ActiveChallengeItemView[]> {
    try {
      const res = await apiClient.get('/challenges/history', { params });
      return res.data?.data ?? [];
    } catch (err) {
      logger.error('Failed to fetch challenge history:', err);
      throw err;
    }
  },

  /**
   * Enroll the authenticated user into a challenge occurrence.
   */
  async enrollChallenge(occurrenceId: string): Promise<ChallengeEnrollmentView> {
    try {
      const res = await apiClient.post(`/challenges/${occurrenceId}/enroll`);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to enroll in challenge occurrence ${occurrenceId}:`, err);
      throw err;
    }
  },

  /**
   * Evaluate and return up-to-date user progress for a challenge occurrence.
   */
  async getChallengeProgress(occurrenceId: string): Promise<ChallengeEnrollmentView> {
    try {
      const res = await apiClient.get(`/challenges/${occurrenceId}/progress`);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to get challenge progress for occurrence ${occurrenceId}:`, err);
      throw err;
    }
  },

  /**
   * Claim reward (points and badge) for a verified completed challenge occurrence.
   */
  async claimChallengeReward(occurrenceId: string): Promise<ClaimRewardResult> {
    try {
      const res = await apiClient.post(`/challenges/${occurrenceId}/claim`);
      return res.data?.data;
    } catch (err) {
      logger.error(`Failed to claim reward for challenge occurrence ${occurrenceId}:`, err);
      throw err;
    }
  },

  // =========================================================================
  // Member Gamification Endpoints
  // =========================================================================

  /**
   * Fetch user's gamification summary profile (points, level, badges count, challenges won).
   */
  async getGamificationSummary(): Promise<GamificationProfileView> {
    try {
      const res = await apiClient.get('/gamification/summary');
      return res.data?.data;
    } catch (err) {
      logger.error('Failed to fetch gamification summary:', err);
      throw err;
    }
  },

  /**
   * Fetch badges catalog annotated with user's earned status and dates.
   */
  async getBadges(): Promise<BadgeView[]> {
    try {
      const res = await apiClient.get('/gamification/badges');
      return res.data?.data ?? [];
    } catch (err) {
      logger.error('Failed to fetch badges catalog:', err);
      throw err;
    }
  },

  /**
   * Fetch authenticated user's points ledger history.
   */
  async getPointsHistory(params?: GetPointsHistoryParams): Promise<PointsLedgerView[]> {
    try {
      const res = await apiClient.get('/gamification/points/history', { params });
      return res.data?.data ?? [];
    } catch (err) {
      logger.error('Failed to fetch points history:', err);
      throw err;
    }
  },
};
