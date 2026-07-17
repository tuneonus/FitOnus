import { createMMKV } from 'react-native-mmkv';
import { logger } from '../utils/logger';

export const storage = createMMKV();

export const StorageService = {
  setItem: (key: string, value: string | number | boolean) => {
    try {
      storage.set(key, value);
    } catch (error) {
      logger.error(`Error setting item in storage for key ${key}`, error);
    }
  },

  getItem: (key: string): string | undefined => {
    try {
      return storage.getString(key);
    } catch (error) {
      logger.error(`Error getting item from storage for key ${key}`, error);
      return undefined;
    }
  },

  getBoolean: (key: string): boolean | undefined => {
    try {
      return storage.getBoolean(key);
    } catch (error) {
      logger.error(`Error getting boolean from storage for key ${key}`, error);
      return undefined;
    }
  },

  getNumber: (key: string): number | undefined => {
    try {
      return storage.getNumber(key);
    } catch (error) {
      logger.error(`Error getting number from storage for key ${key}`, error);
      return undefined;
    }
  },

  removeItem: (key: string) => {
    try {
      storage.remove(key);
    } catch (error) {
      logger.error(`Error removing item from storage for key ${key}`, error);
    }
  },

  clearAll: () => {
    try {
      storage.clearAll();
    } catch (error) {
      logger.error('Error clearing storage', error);
    }
  },
};
