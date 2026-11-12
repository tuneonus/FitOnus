import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Logo } from '../../../shared/components/common/Logo';
import { useTheme } from '@/hooks/use-theme';
import { AuthService } from '../services/auth-service';
import { useAuthStore } from '../stores/auth-store';
import { profileApi } from '@/features/profile/api/profile-api';

export function SplashScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { reset } = useNavigation();

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      await AuthService.initialize();
      const isAuth = useAuthStore.getState().isAuthenticated;

      if (isAuth) {
        const user = useAuthStore.getState().user;
        if (user?.onboardingCompleted) {
          if (!cancelled) reset('home');
          return;
        }
        try {
          const profile = await profileApi.getProfile();
          if (profile?.onboardingCompleted) {
            if (!cancelled) reset('home');
            return;
          } else {
            if (!cancelled) reset('onboarding');
            return;
          }
        } catch {
          if (!cancelled) reset('onboarding');
          return;
        }
      }

      const t = setTimeout(() => {
        if (!cancelled) reset('welcome');
      }, 1400);

      return () => clearTimeout(t);
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [reset]);

  return (
    <View style={[styles.container, { backgroundColor: colors.hero }]}>
      <View style={styles.centerBox}>
        <Logo size={88} />
        <Text style={[styles.title, { color: colors.heroInk }]}>OnusFit</Text>
        <Text style={[styles.subtitle, { color: colors.accent }]}>Own Your Fitness.</Text>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading OnusFit"
        style={[styles.dotsRow, { bottom: Math.max(insets.bottom + 40, 64) }]}
      >
        {[0.35, 1, 0.35].map((opacity, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: colors.accent, opacity, width: i === 1 ? 18 : 6 },
            ]}
          />
        ))}
      </View>

      <Text
        style={[
          styles.brandBottom,
          { color: colors.heroMuted, bottom: Math.max(insets.bottom + 12, 28) },
        ]}
      >
        A TuneOnus product
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    marginTop: 24,
    letterSpacing: -1.2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  dotsRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  brandBottom: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});
