import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
export type Units = 'metric' | 'imperial';

type SettingsState = {
  theme: ThemePreference;
  units: Units;
  setTheme: (theme: ThemePreference) => void;
  setUnits: (units: Units) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  units: 'metric',
  setTheme: (theme) => set({ theme }),
  setUnits: (units) => set({ units })
}));
