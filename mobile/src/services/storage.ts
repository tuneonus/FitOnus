import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// AsyncStorage is included in Expo Go. Tokens remain in SecureStore.
export const storage = AsyncStorage;

export const StorageService = {
  async setItem(key: string, value: string | number | boolean): Promise<void> {
    try {
      await storage.setItem(key, String(value));
    } catch (error) {
      logger.error(`Error saving preference ${key}`, error);
    }
  },
  async getItem(key: string): Promise<string | undefined> {
    try {
      return (await storage.getItem(key)) ?? undefined;
    } catch (error) {
      logger.error(`Error reading preference ${key}`, error);
      return undefined;
    }
  },
  async getBoolean(key: string): Promise<boolean | undefined> {
    const value = await StorageService.getItem(key);
    return value === 'true' ? true : value === 'false' ? false : undefined;
  },
  async getNumber(key: string): Promise<number | undefined> {
    const value = await StorageService.getItem(key);
    if (value === undefined) return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  },
  async removeItem(key: string): Promise<void> {
    try {
      await storage.removeItem(key);
    } catch (error) {
      logger.error(`Error removing preference ${key}`, error);
    }
  },
  async clearAll(): Promise<void> {
    try {
      await storage.clear();
    } catch (error) {
      logger.error('Error clearing preferences', error);
    }
  },
};
