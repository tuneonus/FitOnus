import { Image } from 'expo-image';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { shouldClearPrivateImages, type SessionSnapshot } from './private-image';

/**
 * Private pictures are cached on the device by expo-image (memory and disk) so they open instantly and survive URL
 * refreshes. That cache must not outlive the member's session: when someone signs out, is signed out, or another account
 * signs in, both caches are emptied so the next person using the phone cannot be shown the previous member's photos.
 * The rule itself (`shouldClearPrivateImages`) is pure and tested; this file only connects it to the auth store and to
 * expo-image.
 *
 * Registered once, at app start (the root layout), so a sign-out can never happen before the reset is listening. It
 * also empties the cache when the app starts and finds nobody signed in. `PrivateImage` calls it again as a safeguard;
 * a second call does nothing.
 */
let registered = false;

export async function clearPrivateImageCaches(): Promise<void> {
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()]);
}

const snapshot = (state: ReturnType<typeof useAuthStore.getState>): SessionSnapshot => ({
  userId: state.user?.id ?? null,
  isAuthenticated: state.isAuthenticated,
  isLoading: state.isLoading,
});

export function registerPrivateImageCacheReset(): void {
  if (registered) return;
  registered = true;
  useAuthStore.subscribe((state, previous) => {
    if (shouldClearPrivateImages(snapshot(previous), snapshot(state))) void clearPrivateImageCaches();
  });
  // Registered after the saved session was already read (a late call), and nobody is signed in: clear now, because the
  // start-up transition this rule watches for has already passed.
  const current = useAuthStore.getState();
  if (!current.isLoading && !current.isAuthenticated) void clearPrivateImageCaches();
}
