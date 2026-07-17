import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AppProviders } from '../providers/app-providers';
import { useAuthStore } from '../features/auth/stores/auth-store';
import { AuthService } from '../features/auth/services/auth-service';
import { useAppStore } from '../stores/app-store';
import { Loading } from '../components/ui/loading';

function RootLayoutNav() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { hasCompletedOnboarding } = useAppStore();
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AuthService.initialize().then(() => setIsReady(true));
  }, []);

  useEffect(() => {
    if (!isReady || isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated) {
      if (!hasCompletedOnboarding && segments.join('/') !== '(auth)/onboarding') {
        router.replace('/(auth)/onboarding');
      } else if (hasCompletedOnboarding && !inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (isAuthenticated) {
      // If user is authenticated and is in auth group, redirect them to app
      if (inAuthGroup || !segments[0]) {
        router.replace('/(tabs)/dashboard');
      }
    }
  }, [isAuthenticated, isLoading, hasCompletedOnboarding, segments, isReady, router]);

  if (!isReady || isLoading) {
    return <Loading fullScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(modals)" options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootLayoutNav />
    </AppProviders>
  );
}
