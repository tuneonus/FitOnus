import { logger } from '../utils/logger';

const memoryFallback = new Map<string, string>();

let SecureStore: any = null;
try {
  // In native Expo environment, require('expo-secure-store') provides Keychain / Keystore access
  SecureStore = require('expo-secure-store');
} catch {
  // Headless test or non-native environment
}

export const SecureStorageService = {
  setItem: async (key: string, value: string): Promise<boolean> => {
    try {
      if (typeof SecureStore?.setItemAsync === 'function') {
        await SecureStore.setItemAsync(key, value);
        return true;
      }
    } catch (error) {
      logger.warn(`SecureStore not available for setItem (${key}), using fallback`, error);
    }
    memoryFallback.set(key, value);
    return true;
  },

  getItem: async (key: string): Promise<string | null> => {
    try {
      if (typeof SecureStore?.getItemAsync === 'function') {
        const value = await SecureStore.getItemAsync(key);
        if (value !== null && value !== undefined) return value;
      }
    } catch (error) {
      logger.warn(`SecureStore not available for getItem (${key}), using fallback`, error);
    }
    return memoryFallback.get(key) ?? null;
  },

  removeItem: async (key: string): Promise<boolean> => {
    try {
      if (typeof SecureStore?.deleteItemAsync === 'function') {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      logger.warn(`SecureStore not available for removeItem (${key}), using fallback`, error);
    }
    memoryFallback.delete(key);
    return true;
  },
};
