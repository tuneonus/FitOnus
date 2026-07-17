import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { storage } from '../services/storage';

// Custom storage adapter for Zustand to use MMKV
const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    return storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    return storage.remove(name);
  },
};

interface AppState {
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      setHasCompletedOnboarding: (value) => set({ hasCompletedOnboarding: value }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
