import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { type BottomTabBarProps } from 'expo-router/js-tabs';
import { Activity, House, ListOrdered, Plus, User, Zap } from 'lucide-react-native';
import { Pressable, Text, View, LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
  interpolateColor,
  type SharedValue
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/use-theme';
import { styles, PILL_HEIGHT, FAB_SIZE, ICON_SIZE } from './LiquidTabBar.styles';

const FAB_PRESSED_SCALE = 0.9;
const SNAP_SPRING = { damping: 28, stiffness: 420, mass: 0.5 } as const;
const TRAIL_SPRING = { damping: 22, stiffness: 320, mass: 0.6 } as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);

interface TabItemProps {
  icon: React.ComponentType<{ color?: string; size?: number }>;
  index: number;
  label: string;
  followerX: SharedValue<number>;
  pillOpacity: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
}

const TabItem = React.memo(({ icon: Icon, index, label, followerX, pillOpacity, activeColor, inactiveColor }: TabItemProps) => {
  const animatedTextStyle = useAnimatedStyle(() => {
    'worklet';
    const dist = Math.abs(followerX.value - index);
    const w = interpolate(dist, [0, 0.2], [1, 0], Extrapolation.CLAMP) * pillOpacity.value;
    return {
      color: interpolateColor(w, [0, 1], [inactiveColor, activeColor]),
      opacity: interpolate(w, [0, 1], [0.78, 1]),
      transform: [{ translateY: interpolate(w, [0, 1], [0, -1]) }],
    };
  });

  const animatedIconStyle = useAnimatedStyle(() => {
    'worklet';
    const dist = Math.abs(followerX.value - index);
    const w = interpolate(dist, [0, 0.2], [1, 0], Extrapolation.CLAMP) * pillOpacity.value;
    return {
      transform: [
        { translateY: interpolate(w, [0, 1], [0, -2]) },
        { scale: interpolate(w, [0, 1], [1, 1.06]) },
      ],
    };
  });

  const activeIconStyle = useAnimatedStyle(() => {
    'worklet';
    const dist = Math.abs(followerX.value - index);
    return { opacity: dist < 0.3 ? interpolate(dist, [0, 0.2], [1, 0], Extrapolation.CLAMP) * pillOpacity.value : 0 };
  });

  const normalIconStyle = useAnimatedStyle(() => {
    'worklet';
    const dist = Math.abs(followerX.value - index);
    const a = dist < 0.3 ? interpolate(dist, [0, 0.2], [1, 0], Extrapolation.CLAMP) * pillOpacity.value : 0;
    return { opacity: 1 - a, position: 'absolute' as const };
  });

  return (
    <View style={styles.tabItem} className="h-full z-10">
      <Animated.View style={[styles.iconWrapper, animatedIconStyle]}>
        <Animated.View style={activeIconStyle}>
          <Icon size={ICON_SIZE} color={activeColor} />
        </Animated.View>
        <Animated.View style={normalIconStyle}>
          <Icon size={ICON_SIZE} color={inactiveColor} />
        </Animated.View>
      </Animated.View>
      <AnimatedText style={[styles.tabLabel, animatedTextStyle]} numberOfLines={1}>
        {label}
      </AnimatedText>
    </View>
  );
});

interface AnimatedFABProps {
  onPress: () => void;
  fabBg: string;
  fabIconColor: string;
  glowColor: string;
}

const AnimatedFAB = React.memo(({ onPress, fabBg, fabIconColor, glowColor }: AnimatedFABProps) => {
  const fabScale = useSharedValue(1);
  const progress = useSharedValue(0);

  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    glowScale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(1.7, { duration: 1200 }),
      ),
      -1,
      false,
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 0 }),
        withTiming(0, { duration: 1200 }),
      ),
      -1,
      false,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: glowColor,
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const animateTo = useCallback((collapse: boolean) => {
    progress.value = withSpring(collapse ? 0 : 1, SNAP_SPRING);
  }, [progress]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const tick = (collapse: boolean) => {
      animateTo(collapse);
      timeout = setTimeout(() => tick(!collapse), 2500);
    };
    timeout = setTimeout(() => tick(false), 1000);
    return () => clearTimeout(timeout);
  }, [animateTo]);

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(progress.value, [0, 1], [1, 0.5]);
    const opacity = interpolate(progress.value, [0, 1], [1, 0]);
    const rotate = `${interpolate(progress.value, [0, 1], [0, 90])}deg`;
    return {
      opacity,
      transform: [{ scale }, { rotate }],
    };
  });

  const textStyle = useAnimatedStyle(() => {
    'worklet';
    const scale = interpolate(progress.value, [0, 1], [0.5, 1]);
    const opacity = interpolate(progress.value, [0, 1], [0, 1]);
    const rotate = `${interpolate(progress.value, [0, 1], [-90, 0])}deg`;
    return {
      opacity,
      transform: [{ scale }, { rotate }],
    };
  });

  return (
    <Animated.View style={[fabStyle, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={glowStyle} />
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        onPressIn={() => {
          fabScale.value = withSpring(FAB_PRESSED_SCALE);
        }}
        onPressOut={() => {
          fabScale.value = withSpring(1);
        }}
        style={[
          styles.fabButton,
          {
            backgroundColor: fabBg,
            shadowColor: glowColor,
            shadowOpacity: 0.45,
            shadowRadius: 12,
            elevation: 10,
          },
        ]}
      >
        <Animated.View style={[{ position: 'absolute' }, iconStyle]}>
          <Zap size={24} color={fabIconColor} strokeWidth={2.5} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, textStyle]}>
          <Text style={[styles.fabText, { color: fabIconColor }]} numberOfLines={1}>
            Track
          </Text>
        </Animated.View>
      </AnimatedPressable>
    </Animated.View>
  );
});

export default function LiquidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const currentRoute = state.routes[state.index];

  const VISUAL_TABS = useMemo(() => [
    { type: 'tab', name: 'dashboard', label: 'Home', Icon: House },
    { type: 'tab', name: 'coach', label: 'Coach', Icon: Activity },
    { type: 'fab' },
    { type: 'tab', name: 'workouts', label: 'Workouts', Icon: ListOrdered },
    { type: 'tab', name: 'profile', label: 'Profile', Icon: User },
  ], []);

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();

  const barBg = colors.backgroundElement;
  const activeColor = colors.primary;
  const activePillBg = activeColor;
  const inactiveColor = colors.textSecondary;

  const fabBg = colors.primary;
  const fabIconColor = colors.textInverse;

  const [barWidth, setBarWidth] = useState(0);
  const tabWidthShared = useSharedValue(0);

  const activeIndex = state.index;
  const activeVisualIndex = activeIndex >= 2 ? activeIndex + 1 : activeIndex;

  const lastValidIndex = useRef(activeVisualIndex === -1 ? 0 : activeVisualIndex);
  if (activeVisualIndex !== -1) lastValidIndex.current = activeVisualIndex;

  const leaderX = useSharedValue(lastValidIndex.current);
  const followerX = useSharedValue(lastValidIndex.current);
  const pillOpacity = useSharedValue(activeIndex === -1 ? 0 : 1);

  useEffect(() => {
    if (activeIndex !== -1) {
      pillOpacity.value = withSpring(1, SNAP_SPRING);
      leaderX.value = withSpring(activeVisualIndex, SNAP_SPRING);
      followerX.value = withSpring(activeVisualIndex, TRAIL_SPRING);
    } else {
      pillOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [activeIndex, activeVisualIndex, pillOpacity, leaderX, followerX]);

  const navigateToVisualIndex = useCallback((vIndex: number) => {
    if (vIndex === 2) return;
    const rIndex = vIndex > 2 ? vIndex - 1 : vIndex;
    const route = state.routes[rIndex];
    if (route) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      navigation.navigate(route.name);
    }
  }, [state.routes, navigation]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    const tw = width / VISUAL_TABS.length;
    setBarWidth(width);
    tabWidthShared.value = tw;
    if (barWidth === 0) {
      leaderX.value = activeVisualIndex === -1 ? 0 : activeVisualIndex;
      followerX.value = activeVisualIndex === -1 ? 0 : activeVisualIndex;
    }
  }, [barWidth, VISUAL_TABS.length, activeVisualIndex, tabWidthShared, leaderX, followerX]);

  const panGesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-6, 6])
    .onUpdate((e) => {
      'worklet';
      const tw = tabWidthShared.value;
      if (tw <= 0) return;
      const clamped = Math.max(0, Math.min(VISUAL_TABS.length - 1, e.x / tw));
      leaderX.value = clamped;
      followerX.value = withSpring(clamped, TRAIL_SPRING);
    })
    .onEnd(() => {
      'worklet';
      const final = Math.min(VISUAL_TABS.length - 1, Math.max(0, Math.round(leaderX.value)));
      const snappedFinal = final === 2 ? (leaderX.value > 2 ? 3 : 1) : final;
      leaderX.value = withSpring(snappedFinal, SNAP_SPRING);
      followerX.value = withSpring(snappedFinal, TRAIL_SPRING);
      if (final !== 2) runOnJS(navigateToVisualIndex)(snappedFinal);
    }),
    [VISUAL_TABS.length, navigateToVisualIndex, tabWidthShared, leaderX, followerX]);

  const tapGesture = useMemo(() => Gesture.Tap()
    .maxDistance(14)
    .onEnd((e) => {
      'worklet';
      const tw = tabWidthShared.value;
      if (tw <= 0) return;
      const final = Math.min(VISUAL_TABS.length - 1, Math.max(0, Math.floor(e.x / tw)));
      if (final === 2) return;
      leaderX.value = withSpring(final, SNAP_SPRING);
      followerX.value = withSpring(final, TRAIL_SPRING);
      runOnJS(navigateToVisualIndex)(final);
    }),
    [VISUAL_TABS.length, navigateToVisualIndex, tabWidthShared, leaderX, followerX]);

  const gesture = useMemo(() => Gesture.Race(tapGesture, panGesture), [tapGesture, panGesture]);

  const animatedPillStyle = useAnimatedStyle(() => {
    'worklet';
    const tw = tabWidthShared.value;
    const indicatorWidth = Math.min(Math.max(tw * 0.3, 22), 30);
    return {
      transform: [
        { translateX: followerX.value * tw + (tw - indicatorWidth) / 2 },
        { scaleX: interpolate(pillOpacity.value, [0, 1], [0.72, 1]) },
      ],
      width: indicatorWidth,
      backgroundColor: activePillBg,
      opacity: pillOpacity.value,
    };
  });

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: insets.bottom ? insets.bottom : 12, paddingHorizontal: 16 }
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.innerContainer, { height: PILL_HEIGHT }]}>

        <GestureDetector gesture={gesture}>
          <View
            onLayout={onLayout}
            style={[
              styles.barWrapper,
              { height: PILL_HEIGHT, borderRadius: PILL_HEIGHT / 2, backgroundColor: barBg },
              { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 }
            ]}
          >
            {barWidth > 0 && (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: PILL_HEIGHT / 2, overflow: 'hidden' }}>
                <Animated.View
                  style={[
                    animatedPillStyle,
                    {
                      position: 'absolute',
                      height: 3,
                      bottom: 9,
                      borderRadius: 2,
                      overflow: 'hidden',
                    },
                  ]}
                />
              </View>
            )}

            {VISUAL_TABS.map((tab, index) => {
              if (tab.type === 'fab') {
                return <View key="fab-placeholder" style={{ flex: 1 }} />;
              }
              return (
                <TabItem
                  key={tab.name}
                  index={index}
                  icon={tab.Icon!}
                  label={tab.label!}
                  followerX={followerX}
                  pillOpacity={pillOpacity}
                  activeColor={activeColor}
                  inactiveColor={inactiveColor}
                />
              );
            })}
          </View>
        </GestureDetector>

        <View pointerEvents="box-none" style={styles.fabWrapper}>
          <AnimatedFAB
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
              router.push('/(modals)/quick-log');
            }}
            fabBg={fabBg}
            fabIconColor={fabIconColor}
            glowColor={fabBg}
          />
        </View>

      </View>
    </View>
  );
}
