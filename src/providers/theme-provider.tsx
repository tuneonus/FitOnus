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
  const [isHydrated, setIsHydrated] = useState(false);
  const isDark = mode === 'system' ? deviceColorScheme === 'dark' : mode === 'dark';

  useEffect(() => {
    let mounted = true;
    void StorageService.getItem(THEME_STORAGE_KEY).then((savedMode) => {
      if (!mounted) return;
      if (savedMode === 'system' || savedMode === 'light' || savedMode === 'dark') {
        setModeState(savedMode);
      }
      setIsHydrated(true);
    });
    return () => { mounted = false; };
  }, []);

  const setThemeMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    void StorageService.setItem(THEME_STORAGE_KEY, newMode);
  };

  if (!isHydrated) return null;

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
