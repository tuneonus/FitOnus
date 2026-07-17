import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { Colors, ThemeColors } from '../constants/theme';
import { StorageService } from '../services/storage';

type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  colors: ThemeColors;
  mode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = 'app.theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const deviceColorScheme = useDeviceColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isDark, setIsDark] = useState<boolean>(deviceColorScheme === 'dark');

  // Load saved theme on mount
  useEffect(() => {
    const savedMode = StorageService.getItem(THEME_STORAGE_KEY) as ThemeMode | undefined;
    if (savedMode && ['system', 'light', 'dark'].includes(savedMode)) {
      setModeState(savedMode);
    }
  }, []);

  // Update effective theme when mode or device scheme changes
  useEffect(() => {
    if (mode === 'system') {
      setIsDark(deviceColorScheme === 'dark');
    } else {
      setIsDark(mode === 'dark');
    }
  }, [mode, deviceColorScheme]);

  const setThemeMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    StorageService.setItem(THEME_STORAGE_KEY, newMode);
  };

  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ colors, mode, isDark, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Also create the useTheme hook here as it's tightly coupled
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
