import { captureUserSession, sessionSetter, registerUserStore } from '@/services/user-session';
import { create } from 'zustand';
import { challengesApi } from '../api/challenges-api';
import { challengesCache } from '../services/challenges-cache';
import type {
  ActiveChallengeItemView,
  BadgeView,
  ChallengeEnrollmentView,
  ClaimRewardResult,
  GamificationProfileView,
  PointsLedgerView,
} from '../types/challenges';
import { logger } from '@/utils/logger';

export interface ChallengesState {
  activeChallenges: ActiveChallengeItemView[];
  history: ActiveChallengeItemView[];
  profile: GamificationProfileView | null;
  badges: BadgeView[];
  pointsHistory: PointsLedgerView[];
  isLoading: boolean;
  isRefreshing: boolean;
  isEnrolling: Record<string, boolean>;
  isClaiming: Record<string, boolean>;
  error: string | null;

  // Actions
  fetchActiveChallenges: (options?: { force?: boolean }) => Promise<void>;
  fetchChallengeHistory: (status?: 'active' | 'completed' | 'failed') => Promise<void>;
  fetchGamificationSummary: (options?: { force?: boolean }) => Promise<void>;
  fetchBadges: (options?: { force?: boolean }) => Promise<void>;
  fetchPointsHistory: (limit?: number) => Promise<void>;
  refreshAll: () => Promise<void>;

  enrollInChallenge: (occurrenceId: string) => Promise<ChallengeEnrollmentView | null>;
  claimReward: (occurrenceId: string) => Promise<ClaimRewardResult | null>;
  resetStore: () => Promise<void>;
}

export const useChallengesStore = create<ChallengesState>((storeSet, get) => {
  const set = storeSet;
  return {
    activeChallenges: [],
    history: [],
    profile: null,
    badges: [],
    pointsHistory: [],
    isLoading: false,
    isRefreshing: false,
    isEnrolling: {},
    isClaiming: {},
    error: null,

    fetchActiveChallenges: async (options) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const isInitial = get().activeChallenges.length === 0;
      if (isInitial) {
        const cached = await challengesCache.loadChallengesCache();
        if (!session.isCurrent()) return;
        if (cached && cached.length > 0) {
          set({ activeChallenges: cached });
        }
      }

      set({ [options?.force ? 'isRefreshing' : 'isLoading']: true, error: null });

      try {
        const challenges = await challengesApi.getActiveChallenges({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        });
        if (!session.isCurrent()) return;
        set({ activeChallenges: challenges, isLoading: false, isRefreshing: false });
        await challengesCache.saveChallengesCache(challenges);
        if (!session.isCurrent()) return;
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch active challenges from backend:', err?.message);
        set({
          isLoading: false,
          isRefreshing: false,
          error:
            get().activeChallenges.length === 0
              ? 'Unable to load challenges. Check your connection.'
              : null,
        });
      }
    },

    fetchChallengeHistory: async (status) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isLoading: true, error: null });
      try {
        const history = await challengesApi.getChallengeHistory(status ? { status } : undefined);
        if (!session.isCurrent()) return;
        set({ history, isLoading: false });
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch challenge history:', err?.message);
        set({ isLoading: false, error: 'Unable to load challenge history.' });
      }
    },

    fetchGamificationSummary: async (options) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const isInitial = !get().profile;
      if (isInitial) {
        const cached = await challengesCache.loadProfileCache();
        if (!session.isCurrent()) return;
        if (cached) {
          set({ profile: cached });
        }
      }

      try {
        const profile = await challengesApi.getGamificationSummary();
        if (!session.isCurrent()) return;
        set({ profile });
        await challengesCache.saveProfileCache(profile);
        if (!session.isCurrent()) return;
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch gamification summary:', err?.message);
      }
    },

    fetchBadges: async (options) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const isInitial = get().badges.length === 0;
      if (isInitial) {
        const cached = await challengesCache.loadBadgesCache();
        if (!session.isCurrent()) return;
        if (cached && cached.length > 0) {
          set({ badges: cached });
        }
      }

      try {
        const badges = await challengesApi.getBadges();
        if (!session.isCurrent()) return;
        set({ badges });
        await challengesCache.saveBadgesCache(badges);
        if (!session.isCurrent()) return;
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch badges catalog:', err?.message);
      }
    },

    fetchPointsHistory: async (limit = 50) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      const isInitial = get().pointsHistory.length === 0;
      if (isInitial) {
        const cached = await challengesCache.loadPointsHistoryCache();
        if (!session.isCurrent()) return;
        if (cached && cached.length > 0) {
          set({ pointsHistory: cached });
        }
      }

      try {
        const pointsHistory = await challengesApi.getPointsHistory({ limit });
        if (!session.isCurrent()) return;
        set({ pointsHistory });
        await challengesCache.savePointsHistoryCache(pointsHistory);
        if (!session.isCurrent()) return;
      } catch (err: any) {
        if (!session.isCurrent()) return;
        logger.warn('Failed to fetch points history:', err?.message);
      }
    },

    refreshAll: async () => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      set({ isRefreshing: true, error: null });
      try {
        await Promise.allSettled([
          get().fetchActiveChallenges({ force: true }),
          get().fetchGamificationSummary({ force: true }),
          get().fetchBadges({ force: true }),
          get().fetchPointsHistory(),
        ]);
        if (!session.isCurrent()) return;
      } finally {
        set({ isRefreshing: false });
      }
    },

    enrollInChallenge: async (occurrenceId: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      if (get().isEnrolling[occurrenceId]) {
        return null;
      }

      set((state) => ({
        isEnrolling: { ...state.isEnrolling, [occurrenceId]: true },
        error: null,
      }));

      try {
        const enrollment = await challengesApi.enrollChallenge(occurrenceId);
        session.assertCurrent();

        // Optimistically update active challenges in state
        set((state) => {
          const updated = state.activeChallenges.map((item) => {
            if (item.occurrence.id === occurrenceId) {
              return {
                ...item,
                enrollment,
                enrolled: true,
                canClaim: enrollment.status === 'completed' && !enrollment.claimedAt,
              };
            }
            return item;
          });
          challengesCache.saveChallengesCache(updated).catch(() => {});
          return {
            activeChallenges: updated,
            isEnrolling: { ...state.isEnrolling, [occurrenceId]: false },
          };
        });

        return enrollment;
      } catch (err: any) {
        session.assertCurrent();
        logger.error(`Enrollment failed for occurrence ${occurrenceId}:`, err);
        set((state) => ({
          isEnrolling: { ...state.isEnrolling, [occurrenceId]: false },
          error: err?.response?.data?.message || err?.message || 'Failed to enroll in challenge.',
        }));
        throw err;
      }
    },

    claimReward: async (occurrenceId: string) => {
      const session = captureUserSession();
      const set = sessionSetter(storeSet, session);
      if (get().isClaiming[occurrenceId]) {
        return null;
      }

      set((state) => ({
        isClaiming: { ...state.isClaiming, [occurrenceId]: true },
        error: null,
      }));

      try {
        const result = await challengesApi.claimChallengeReward(occurrenceId);
        session.assertCurrent();

        set((state) => {
          // Mark challenge as claimed and not claimable
          const updatedChallenges = state.activeChallenges.map((item) => {
            if (item.occurrence.id === occurrenceId && item.enrollment) {
              return {
                ...item,
                canClaim: false,
                enrollment: {
                  ...item.enrollment,
                  status: 'claimed' as const,
                  claimedAt: new Date().toISOString(),
                },
              };
            }
            return item;
          });

          // Update profile total points and level
          const updatedProfile: GamificationProfileView | null = state.profile
            ? {
                ...state.profile,
                totalPoints: result.newTotalPoints,
                currentLevel: result.newLevel,
                challengesWon: state.profile.challengesWon + 1,
              }
            : null;

          challengesCache.saveChallengesCache(updatedChallenges).catch(() => {});
          if (updatedProfile) {
            challengesCache.saveProfileCache(updatedProfile).catch(() => {});
          }

          return {
            activeChallenges: updatedChallenges,
            profile: updatedProfile,
            isClaiming: { ...state.isClaiming, [occurrenceId]: false },
          };
        });

        // Refresh badges and points history asynchronously to reflect latest earned badges and ledger
        get()
          .fetchBadges({ force: true })
          .catch(() => {});
        get()
          .fetchPointsHistory()
          .catch(() => {});

        return result;
      } catch (err: any) {
        session.assertCurrent();
        logger.error(`Claim reward failed for occurrence ${occurrenceId}:`, err);
        set((state) => ({
          isClaiming: { ...state.isClaiming, [occurrenceId]: false },
          error:
            err?.response?.data?.message || err?.message || 'Failed to claim challenge reward.',
        }));
        throw err;
      }
    },

    resetStore: async () => {
      await challengesCache.clearUserCache();
      set({
        activeChallenges: [],
        history: [],
        profile: null,
        badges: [],
        pointsHistory: [],
        isLoading: false,
        isRefreshing: false,
        isEnrolling: {},
        isClaiming: {},
        error: null,
      });
    },
  };
});

registerUserStore(useChallengesStore);
