import React from 'react';
import { Slot } from 'expo-router';
import * as NativeSplash from 'expo-splash-screen';
import { AppProviders } from '../providers/app-providers';

// Keep the native splash visible until ThemeProvider has hydrated the saved
// theme (it calls hideAsync), so the first visible frame is already themed.
NativeSplash.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <AppProviders>
      <Slot />
    </AppProviders>
  );
}
