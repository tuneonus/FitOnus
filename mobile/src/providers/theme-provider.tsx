import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { Colors, ThemeColors } from '../constants/theme';
import { StorageService } from '../services/storage';
import { useSettingsStore, type ThemePreference, THEME_STORAGE_KEY } from '@/shared/stores/settingsStore';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  colors: ThemeColors;
  mode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const deviceColorScheme = useDeviceColorScheme();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void StorageService.getItem(THEME_STORAGE_KEY).then((savedMode) => {
      if (!mounted) return;
      if (savedMode === 'system' || savedMode === 'light' || savedMode === 'dark') {
        if (useSettingsStore.getState().theme !== savedMode) {
          setTheme(savedMode as ThemePreference);
        }
      }
      setIsReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [setTheme]);

  const setThemeMode = useCallback(
    (newMode: ThemeMode) => {
      setTheme(newMode as ThemePreference);
      void StorageService.setItem(THEME_STORAGE_KEY, newMode);
    },
    [setTheme],
  );

  const isDark = theme === 'system' ? deviceColorScheme === 'dark' : theme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  if (!isReady) return null;

  return (
    <ThemeContext.Provider value={{ colors, mode: theme, isDark, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
