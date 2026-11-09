import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  BackHandler,
  Keyboard,
  Platform,
  useWindowDimensions,
  AppState,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation } from './navigation/NavigationContext';
import { screenExitDuration, shouldCompleteSwipeBack } from './navigation/screenMotion';
import { RouteScreen, heroStatusRoutes } from './routes/screenRegistry';
import { BottomNav } from '@/shared/components/common/BottomNav';
import { ToastHost } from '@/shared/components/common/ToastHost';
import { MaintenanceModal } from '@/shared/components/common/MaintenanceModal';
import { ForceUpdateModal } from '@/shared/components/common/ForceUpdateModal';
import { useRemoteConfigStore } from '@/features/app-config/store/remoteConfigStore';
import { useTheme } from '@/hooks/use-theme';
import { notificationService } from '@/services/notificationService';
import { bindAuthToSettings, useSettingsStore } from '@/shared/stores/settingsStore';
import { useAuthStore } from '@/features/auth/stores/auth-store';

function AnimatedScreenWrapper({
  routeKey,
  direction,
  children,
}: {
  routeKey: string;
  direction: number;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const transitionX = useSharedValue(
    reducedMotion ? 0 : direction === 1 ? 36 : direction === -1 ? -28 : 0
  );
  const opacity = useSharedValue(
    reducedMotion ? 1 : direction === 0 ? 0.85 : 0.65
  );

  useEffect(() => {
    if (reducedMotion) {
      transitionX.set(0);
      opacity.set(1);
      return;
    }

    if (direction === 1) {
      transitionX.set(36);
      opacity.set(0.65);
      transitionX.set(withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }));
      opacity.set(withTiming(1, { duration: 200 }));
    } else if (direction === -1) {
      transitionX.set(-28);
      opacity.set(0.7);
      transitionX.set(withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }));
      opacity.set(withTiming(1, { duration: 180 }));
    } else {
      transitionX.set(0);
      opacity.set(0.85);
      opacity.set(withTiming(1, { duration: 150 }));
    }
  }, [routeKey, direction, reducedMotion, transitionX, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: transitionX.value }],
  }));

  return (
    <Animated.View style={[styles.screenContainer, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

export function AppShell() {
  const { route, direction, isTabRoot, canGoBack, goBack } = useNavigation();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const initConfig = useRemoteConfigStore((s) => s.init);

  useEffect(() => {
    return initConfig();
  }, [initConfig]);

  // Initialize notifications, sync auth lifecycle, and reconcile on app active state
  useEffect(() => {
    void notificationService.initializeNotifications();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void notificationService.reconcileNotificationSchedules();
      }
    });

    const unbindAuth = bindAuthToSettings(useAuthStore);
    const currentUser = useAuthStore.getState().user;
    if (currentUser?.id) {
      void useSettingsStore.getState().hydrateForUser(currentUser.id);
    }

    return () => {
      sub.remove();
      unbindAuth();
    };
  }, []);

  // Handle hardware back button on Android
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack, goBack]);

  // Track keyboard visibility to avoid overlap on Android & iOS
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Edge swipe-back gesture for nested screens
  const swipeX = useSharedValue(0);
  const isEdgeEligible = useSharedValue(false);
  const isLeaving = useSharedValue(false);

  const swipeGesture = Gesture.Pan()
    .enabled(canGoBack && !isTabRoot && !isKeyboardVisible && Platform.OS !== 'web')
    .activeOffsetX([8, 9999])
    .failOffsetX([-10, 0])
    .failOffsetY([-18, 18])
    .maxPointers(1)
    .onBegin((event) => {
      if (event.x <= 32) {
        isEdgeEligible.set(true);
        isLeaving.set(false);
      } else {
        isEdgeEligible.set(false);
      }
    })
    .onUpdate((event) => {
      if (isEdgeEligible.get() && !isLeaving.get()) {
        swipeX.set(Math.max(0, event.translationX));
      }
    })
    .onEnd((event) => {
      if (!isEdgeEligible.get() || isLeaving.get()) return;
      if (shouldCompleteSwipeBack(swipeX.get(), event.velocityX, width)) {
        isLeaving.set(true);
        swipeX.set(
          withTiming(
            width,
            {
              duration: reducedMotion
                ? 0
                : screenExitDuration(width - swipeX.get(), event.velocityX, 200),
              easing: Easing.out(Easing.cubic),
            },
            (finished) => {
              if (finished) {
                runOnJS(goBack)();
              }
              swipeX.set(0);
              isLeaving.set(false);
            }
          )
        );
      } else {
        swipeX.set(withSpring(0, { damping: 24, stiffness: 320 }));
      }
      isEdgeEligible.set(false);
    })
    .onFinalize(() => {
      if (!isLeaving.get()) {
        swipeX.set(withSpring(0, { damping: 24, stiffness: 320 }));
      }
      isEdgeEligible.set(false);
    });

  const swipeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
  }));

  const isHero = heroStatusRoutes.includes(route.name);
  const isTabScreen =
    isTabRoot ||
    ['home', 'activity', 'coach', 'progress', 'profile'].includes(route.name);
  const showBottomNav = isTabScreen && !isKeyboardVisible;

  // Smooth BottomNav transitions on keyboard open/close or route change
  const navTranslateY = useSharedValue(showBottomNav ? 0 : 90);
  const navOpacity = useSharedValue(showBottomNav ? 1 : 0);

  useEffect(() => {
    navTranslateY.set(
      withTiming(showBottomNav ? 0 : 90, {
        duration: reducedMotion ? 0 : 180,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      })
    );
    navOpacity.set(
      withTiming(showBottomNav ? 1 : 0, {
        duration: reducedMotion ? 0 : 160,
      })
    );
  }, [showBottomNav, reducedMotion, navTranslateY, navOpacity]);

  const navAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: navTranslateY.value }],
    opacity: navOpacity.value,
  }));

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isHero || isDark ? 'light-content' : 'dark-content'} />
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.screenContainer, swipeAnimatedStyle]}>
          <AnimatedScreenWrapper routeKey={route.key} direction={direction}>
            <RouteScreen name={route.name} />
          </AnimatedScreenWrapper>
        </Animated.View>
      </GestureDetector>
      <Animated.View
        pointerEvents={showBottomNav ? 'auto' : 'none'}
        style={[styles.bottomNavContainer, navAnimatedStyle]}
      >
        <BottomNav />
      </Animated.View>
      <ToastHost raised={showBottomNav} />
      <MaintenanceModal />
      <ForceUpdateModal />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
  },
  screenContainer: {
    flex: 1,
  },
  bottomNavContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
});
