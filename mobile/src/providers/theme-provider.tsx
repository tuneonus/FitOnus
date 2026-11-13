import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Appearance, useColorScheme as useDeviceColorScheme } from 'react-native';
import * as NativeSplash from 'expo-splash-screen';
import { Colors, ThemeColors } from '../constants/theme';
import { useSettingsStore, type ThemePreference } from '@/shared/stores/settingsStore';
import { resolveIsDark } from './theme-resolution';

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

/**
 * Single app-wide theme provider, mounted at the root layout. The preference
 * itself lives in the settings store (one source of truth); this provider
 * hydrates it from device storage before rendering any navigation, and keeps
 * the native splash screen up until that is done so the app never flashes the
 * system theme before the saved one.
 */
export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const deviceColorScheme = useDeviceColorScheme();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const hydrateTheme = useSettingsStore((s) => s.hydrateTheme);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void hydrateTheme().finally(() => {
      if (mounted) setIsReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [hydrateTheme]);

  // Hide the native splash only once the saved theme is applied and the first
  // themed frame has been committed.
  useEffect(() => {
    if (isReady) void NativeSplash.hideAsync().catch(() => {});
  }, [isReady]);

  // Keep native UI (alerts, keyboard, pickers) in step with an explicit choice;
  // "system" hands control back to the device.
  useEffect(() => {
    if (!isReady) return;
    try {
      Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
    } catch {
      // Not supported on this platform; the in-app theme still applies.
    }
  }, [theme, isReady]);

  const setThemeMode = useCallback(
    (newMode: ThemeMode) => {
      setTheme(newMode as ThemePreference);
    },
    [setTheme],
  );

  // The device scheme is only consulted when the user chose "system".
  const isDark = resolveIsDark(theme, deviceColorScheme);
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
