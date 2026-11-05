import React, { useEffect } from 'react';
import { NavigationProvider } from './src/app/navigation/NavigationContext';
import { AppShell } from './src/app/AppShell';
import { useHealthStore } from './src/features/health-integration/store/healthStore';
import { useSettingsStore } from './src/shared/stores/settingsStore';
import type { RouteName, RouteParams } from './src/app/navigation/routes';
import { useScreenInit } from './useScreenInit.js';

type AppProps = {
  theme?: 'light' | 'dark';
  startAt?: 'splash' | 'home' | 'coach';
  healthState?: 'synced' | 'loading' | 'noDevice' | 'permissions' | 'offline' | 'error';
};

export function App({ theme = 'dark', startAt = 'home', healthState = 'synced' }: AppProps) {
  const screenInit = (useScreenInit() ?? {}) as {screen?: RouteName;params?: RouteParams;};
  const initialRoute: RouteName = screenInit.screen ?? startAt;
  const pref = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setStatus = useHealthStore((s) => s.setStatus);

  useEffect(() => setTheme(theme), [theme, setTheme]);
  useEffect(() => setStatus(healthState), [healthState, setStatus]);

  const resolved =
  pref === 'system' ?
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ?
  'dark' :
  'light' :
  pref;

  return (
    <div data-theme={resolved} className="flex min-h-screen w-full items-center justify-center bg-surface2 font-sans text-ink sm:py-10">
      <NavigationProvider key={initialRoute} initialRoute={initialRoute} initialParams={screenInit.params}>
        <AppShell />
      </NavigationProvider>
    </div>);

}