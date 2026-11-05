import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar, BackHandler } from 'react-native';
import { useNavigation } from './navigation/NavigationContext';
import { RouteScreen, heroStatusRoutes } from './routes/screenRegistry';
import { BottomNav } from '@/shared/components/common/BottomNav';
import { ToastHost } from '@/shared/components/common/ToastHost';
import { useTheme } from '@/hooks/use-theme';

export function AppShell() {
  const { route, isTabRoot, canGoBack, goBack } = useNavigation();
  const { colors, isDark } = useTheme();

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

  const isHero = heroStatusRoutes.includes(route.name);
  const showBottomNav =
    isTabRoot ||
    ['home', 'activity', 'coach', 'progress', 'profile'].includes(route.name);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isHero || isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.screenContainer}>
        <RouteScreen name={route.name} />
      </View>
      {showBottomNav && <BottomNav />}
      <ToastHost raised={showBottomNav} />
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
});
