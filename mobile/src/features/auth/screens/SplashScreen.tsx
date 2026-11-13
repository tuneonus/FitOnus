/**
 * Animated splash, ported from TuneStack's AnimatedSplashScreen:
 * - Dark navy background (#050B2E)
 * - Logo fades in and scales 0.85 -> 1.0, then the title and "by TuneOnus"
 *   slide up and fade in (~2 second choreography)
 * - Fades out into the destination screen
 * - Respects the system reduced-motion setting
 * - Hardware back is swallowed during playback, and a safety timer guarantees
 *   the splash can never lock up app startup
 *
 * Unlike TuneStack (an overlay), OnusFit's splash is a route: it also runs the
 * auth bootstrap and only navigates once both the animation and bootstrap are done.
 */
import React, { useEffect, useRef } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Logo } from '../../../shared/components/common/Logo';
import { AuthService } from '../services/auth-service';
import { useAuthStore } from '../stores/auth-store';
import { profileApi } from '@/features/profile/api/profile-api';

export const SPLASH_BACKGROUND = '#050B2E';

type Destination = 'home' | 'onboarding' | 'welcome';

async function resolveDestination(): Promise<Destination> {
  try {
    await AuthService.initialize();
  } catch {
    return 'welcome';
  }
  if (!useAuthStore.getState().isAuthenticated) return 'welcome';
  if (useAuthStore.getState().user?.onboardingCompleted) return 'home';
  try {
    const profile = await profileApi.getProfile();
    return profile?.onboardingCompleted ? 'home' : 'onboarding';
  } catch {
    return 'onboarding';
  }
}

export function SplashScreen() {
  const { reset } = useNavigation();
  const reducedMotion = useReducedMotion();

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(reducedMotion ? 1 : 0.85);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(reducedMotion ? 0 : 8);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(reducedMotion ? 0 : 6);
  const containerOpacity = useSharedValue(1);

  const destinationRef = useRef<Destination | null>(null);
  const introDoneRef = useRef(false);
  const leavingRef = useRef(false);
  const cancelledRef = useRef(false);

  const go = () => {
    const destination = destinationRef.current;
    if (cancelledRef.current || !destination) return;
    reset(destination);
  };

  /** Fades out and navigates, once the intro has played and the destination is known. */
  const leaveWhenReady = () => {
    if (leavingRef.current || !introDoneRef.current || !destinationRef.current) return;
    leavingRef.current = true;
    containerOpacity.value = withTiming(
      0,
      { duration: reducedMotion ? 150 : 250, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(go)();
      },
    );
  };

  useEffect(() => {
    cancelledRef.current = false;

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => true);

    void resolveDestination().then((destination) => {
      destinationRef.current = destination;
      leaveWhenReady();
    });

    // Intro length: 1750ms of choreography (350ms with reduced motion).
    const introMs = reducedMotion ? 350 : 1750;
    const introTimer = setTimeout(() => {
      introDoneRef.current = true;
      leaveWhenReady();
    }, introMs);

    // Guaranteed fallback: never hold the user on the splash for long.
    const safetyTimer = setTimeout(() => {
      if (leavingRef.current) {
        go();
        return;
      }
      leavingRef.current = true;
      destinationRef.current ??= 'welcome';
      go();
    }, 8000);

    if (reducedMotion) {
      logoOpacity.value = 1;
      logoScale.value = 1;
      titleOpacity.value = 1;
      titleTranslateY.value = 0;
      subtitleOpacity.value = 1;
      subtitleTranslateY.value = 0;
    } else {
      const out = Easing.out(Easing.cubic);
      logoOpacity.value = withTiming(1, { duration: 650, easing: out });
      logoScale.value = withTiming(1, { duration: 800, easing: Easing.bezier(0.16, 1, 0.3, 1) });
      titleOpacity.value = withDelay(400, withTiming(1, { duration: 500, easing: out }));
      titleTranslateY.value = withDelay(400, withTiming(0, { duration: 500, easing: out }));
      subtitleOpacity.value = withDelay(750, withTiming(1, { duration: 450, easing: out }));
      subtitleTranslateY.value = withDelay(750, withTiming(0, { duration: 450, easing: out }));
    }

    return () => {
      cancelledRef.current = true;
      backSub.remove();
      clearTimeout(introTimer);
      clearTimeout(safetyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading OnusFit"
    >
      <View style={styles.content}>
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <View style={styles.logoGlow} />
          <Logo size={100} />
        </Animated.View>

        <Animated.Text style={[styles.title, titleStyle]}>OnusFit</Animated.Text>
        <Animated.Text style={[styles.subtitle, subtitleStyle]}>by TuneOnus</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', justifyContent: 'center' },
  logoWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  logoGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#1E3A8A',
    opacity: 0.16,
  },
  title: { marginTop: 22, fontSize: 32, fontWeight: '700', letterSpacing: 0.8, color: '#FFFFFF' },
  subtitle: {
    marginTop: 6,
    fontSize: 13.5,
    fontWeight: '500',
    letterSpacing: 0.6,
    color: 'rgba(255, 255, 255, 0.72)',
  },
});
