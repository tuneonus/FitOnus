import React from 'react';
import { Slot } from 'expo-router';
import * as NativeSplash from 'expo-splash-screen';
import { AppProviders } from '../providers/app-providers';
import { registerPrivateImageCacheReset } from '../shared/media/private-image-cache';

// Keep the native splash visible until ThemeProvider has hydrated the saved
// theme (it calls hideAsync), so the first visible frame is already themed.
NativeSplash.preventAutoHideAsync().catch(() => {});

// Member photos are private: empty the on-device image cache on sign-out, on a different account, and at app start when
// nobody is signed in. Registered here, at app start, so it is listening before any sign-out can happen.
registerPrivateImageCacheReset();

export default function RootLayout() {
  return (
    <AppProviders>
      <Slot />
    </AppProviders>
  );
}
