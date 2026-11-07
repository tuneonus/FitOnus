import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { logger } from '@/utils/logger';
import type {
  ActiveChallengeItemView,
  BadgeView,
  GamificationProfileView,
  PointsLedgerView,
} from '../types/challenges';

class ChallengesCacheService {
  private getCacheKey(entity: string): string {
    const userId = useAuthStore.getState().user?.id;
    return userId ? `@fitonus:challenges_${entity}:${userId}` : `@fitonus:challenges_${entity}`;
  }

  // --- Active Challenges Cache ---

  async loadChallengesCache(): Promise<ActiveChallengeItemView[] | null> {
    try {
      const raw = await AsyncStorage.getItem(this.getCacheKey('active'));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn('Failed to load challenges cache:', err);
      return null;
    }
  }

  async saveChallengesCache(challenges: ActiveChallengeItemView[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getCacheKey('active'), JSON.stringify(challenges));
    } catch (err) {
      logger.warn('Failed to save challenges cache:', err);
    }
  }

  // --- Gamification Profile Summary Cache ---

  async loadProfileCache(): Promise<GamificationProfileView | null> {
    try {
      const raw = await AsyncStorage.getItem(this.getCacheKey('profile'));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn('Failed to load gamification profile cache:', err);
      return null;
    }
  }

  async saveProfileCache(profile: GamificationProfileView): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getCacheKey('profile'), JSON.stringify(profile));
    } catch (err) {
      logger.warn('Failed to save gamification profile cache:', err);
    }
  }

  // --- Badges Cache ---

  async loadBadgesCache(): Promise<BadgeView[] | null> {
    try {
      const raw = await AsyncStorage.getItem(this.getCacheKey('badges'));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn('Failed to load badges cache:', err);
      return null;
    }
  }

  async saveBadgesCache(badges: BadgeView[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getCacheKey('badges'), JSON.stringify(badges));
    } catch (err) {
      logger.warn('Failed to save badges cache:', err);
    }
  }

  // --- Points History Cache ---

  async loadPointsHistoryCache(): Promise<PointsLedgerView[] | null> {
    try {
      const raw = await AsyncStorage.getItem(this.getCacheKey('points'));
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn('Failed to load points history cache:', err);
      return null;
    }
  }

  async savePointsHistoryCache(points: PointsLedgerView[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.getCacheKey('points'), JSON.stringify(points));
    } catch (err) {
      logger.warn('Failed to save points history cache:', err);
    }
  }

  // --- Session Cleanup ---

  async clearUserCache(userId?: string): Promise<void> {
    try {
      const targetUserId = userId || useAuthStore.getState().user?.id;
      if (targetUserId) {
        await AsyncStorage.multiRemove([
          `@fitonus:challenges_active:${targetUserId}`,
          `@fitonus:challenges_profile:${targetUserId}`,
          `@fitonus:challenges_badges:${targetUserId}`,
          `@fitonus:challenges_points:${targetUserId}`,
        ]);
      }
    } catch (err) {
      logger.warn('Failed to clear challenges user cache:', err);
    }
  }
}

export const challengesCache = new ChallengesCacheService();
