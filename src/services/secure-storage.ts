import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';

export const SecureStorageService = {
  setItem: async (key: string, value: string): Promise<boolean> => {
    try {
      await SecureStore.setItemAsync(key, value);
      return true;
    } catch (error) {
      logger.error(`Error saving secure item for key ${key}`, error);
      return false;
    }
  },

  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      logger.error(`Error getting secure item for key ${key}`, error);
      return null;
    }
  },

  removeItem: async (key: string): Promise<boolean> => {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (error) {
      logger.error(`Error removing secure item for key ${key}`, error);
      return false;
    }
  },
};
