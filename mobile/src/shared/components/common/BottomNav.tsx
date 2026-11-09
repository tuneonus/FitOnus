import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { House, Activity, Sparkles, TrendingUp, CircleUserRound } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import type { TabKey } from '../../../app/navigation/routes';
import {
  ICON_PULSE_SPRING,
  SNAP_SPRING,
  TAB_SPRING,
  TRAIL_SPRING,
  getTabDragPosition,
  nearestTabSlot,
} from '../../../app/navigation/screenMotion';
import { useTheme } from '@/hooks/use-theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const sideTabs: {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'coach', label: 'AI Coach', icon: Sparkles },
  { key: 'progress', label: 'Progress', icon: TrendingUp },
  { key: 'profile', label: 'Profile', icon: CircleUserRound },
];

function triggerTickHaptic() {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {}
}

function TabButton({
  tab,
  slotIndex,
  isActive,
  dragSlot,
  isDragging,
  onPress,
  colors,
}: {
  tab: (typeof sideTabs)[number];
  slotIndex: number;
  isActive: boolean;
  dragSlot: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pillProgress = useSharedValue(isActive ? 1 : 0);
  const iconBounce = useSharedValue(1);
  const Icon = tab.icon;

  const isHighlighted = useDerivedValue(() => {
    return isDragging.value ? dragSlot.value === slotIndex : isActive;
  });

  useAnimatedReaction(
    () => isHighlighted.value,
    (current, previous) => {
      if (current !== previous) {
        pillProgress.set(
          withTiming(current ? 1 : 0, { duration: reducedMotion ? 0 : 160 })
        );
        if (current && !reducedMotion) {
          iconBounce.set(
            withSequence(
              withTiming(1.18, { duration: 110 }),
              withSpring(1, ICON_PULSE_SPRING)
            )
          );
        }
      }
    }
  );

  useEffect(() => {
    pillProgress.set(withTiming(isActive ? 1 : 0, { duration: reducedMotion ? 0 : 180 }));
    if (isActive && !reducedMotion) {
      iconBounce.set(
        withSequence(withTiming(1.18, { duration: 120 }), withSpring(1, ICON_PULSE_SPRING))
      );
    }
  }, [isActive, reducedMotion, pillProgress, iconBounce]);

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    const isHovered = isDragging.value ? dragSlot.value === slotIndex : false;
    const hoverScale = isHovered ? 1.06 : 1.0;
    return {
      transform: [{ scale: scale.value * hoverScale }],
    };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconBounce.value }],
  }));

  const pillAnimatedStyle = useAnimatedStyle(() => {
    const isHovered = isDragging.value ? dragSlot.value === slotIndex : false;
    const effectivePill = isHovered ? 1 : pillProgress.value;
    return {
      opacity: effectivePill,
      transform: [{ scale: 0.88 + 0.12 * effectivePill }],
    };
  });

  const iconColor = isActive ? colors.accentStrong : colors.muted;

  const handlePressIn = () => {
    scale.set(withTiming(0.92, { duration: reducedMotion ? 0 : 80 }));
  };

  const handlePressOut = () => {
    scale.set(withSpring(1, TAB_SPRING));
  };

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {}
    onPress();
  };

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: isActive }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[styles.tabButton, buttonAnimatedStyle]}
    >
      <View style={styles.iconPill}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.pillFill,
            { backgroundColor: `${colors.accent}24` },
            pillAnimatedStyle,
          ]}
        />
        <Animated.View style={iconAnimatedStyle}>
          <Icon size={22} color={iconColor} strokeWidth={isActive ? 2.3 : 1.8} />
        </Animated.View>
      </View>
      <Text
        style={[
          styles.tabLabel,
          {
            color: isActive ? colors.ink : colors.muted,
            fontWeight: isActive ? '700' : '500',
          },
        ]}
      >
        {tab.label}
      </Text>
    </AnimatedPressable>
  );
}

function CoachButton({
  tab,
  slotIndex,
  isActive,
  dragSlot,
  isDragging,
  onPress,
  colors,
}: {
  tab: (typeof sideTabs)[number];
  slotIndex: number;
  isActive: boolean;
  dragSlot: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const iconPulse = useSharedValue(1);

  const isHighlighted = useDerivedValue(() => {
    return isDragging.value ? dragSlot.value === slotIndex : isActive;
  });

  useAnimatedReaction(
    () => isHighlighted.value,
    (current, previous) => {
      if (current !== previous && current && !reducedMotion) {
        iconPulse.set(
          withSequence(
            withTiming(1.15, { duration: 120 }),
            withSpring(1, ICON_PULSE_SPRING)
          )
        );
      }
    }
  );

  useEffect(() => {
    if (isActive && !reducedMotion) {
      iconPulse.set(
        withSequence(withTiming(1.15, { duration: 130 }), withSpring(1, ICON_PULSE_SPRING))
      );
    }
  }, [isActive, reducedMotion, iconPulse]);

  const buttonAnimatedStyle = useAnimatedStyle(() => {
    const isHovered = isDragging.value ? dragSlot.value === slotIndex : false;
    const hoverScale = isHovered ? 1.08 : 1.0;
    return {
      transform: [{ scale: scale.value * hoverScale }],
    };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconPulse.value }],
  }));

  const handlePressIn = () => {
    scale.set(withTiming(0.92, { duration: reducedMotion ? 0 : 80 }));
  };

  const handlePressOut = () => {
    scale.set(withSpring(1, TAB_SPRING));
  };

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {}
    onPress();
  };

  return (
    <View style={styles.centerFabContainer}>
      <AnimatedPressable
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: isActive }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={[styles.coachButton, buttonAnimatedStyle]}
      >
        <View
          style={[
            styles.coachCircle,
            {
              backgroundColor: colors.accent,
              borderColor: colors.surface,
              shadowColor: colors.accent,
            },
          ]}
        >
          <Animated.View style={iconAnimatedStyle}>
            <Sparkles size={24} color={colors.accentInk} strokeWidth={isActive ? 2.4 : 2.0} />
          </Animated.View>
        </View>
        <Text
          style={[
            styles.tabLabel,
            styles.coachLabel,
            {
              color: isActive ? colors.ink : colors.muted,
              fontWeight: isActive ? '700' : '600',
            },
          ]}
        >
          {tab.label}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

export function BottomNav() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { activeTab, switchTab } = useNavigation();
  const reducedMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);

  const activeIndex = sideTabs.findIndex((t) => t.key === activeTab);
  const currentSlot = activeIndex >= 0 ? activeIndex : 0;

  const dragSlot = useSharedValue(currentSlot);
  const isDragging = useSharedValue(false);
  const leader = useSharedValue(currentSlot);
  const follower = useSharedValue(currentSlot);

  useEffect(() => {
    dragSlot.set(currentSlot);
    leader.set(currentSlot);
    follower.set(reducedMotion ? currentSlot : withSpring(currentSlot, TRAIL_SPRING));
  }, [currentSlot, reducedMotion, dragSlot, leader, follower]);

  const handleSelectSlot = useCallback(
    (slot: number) => {
      const target = sideTabs[slot]?.key;
      if (target) {
        switchTab(target);
      }
    },
    [switchTab]
  );

  const dragGesture = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .maxPointers(1)
    .cancelsTouchesInView(true)
    .onBegin(() => {
      isDragging.set(true);
    })
    .onUpdate((event) => {
      if (barWidth <= 0) return;
      const pos = getTabDragPosition(event.x, barWidth, sideTabs.length);
      leader.set(pos);
      follower.set(reducedMotion ? pos : withSpring(pos, TRAIL_SPRING));
      const target = nearestTabSlot(pos, sideTabs.length - 1);
      if (target !== dragSlot.get()) {
        dragSlot.set(target);
        runOnJS(triggerTickHaptic)();
      }
    })
    .onEnd((event) => {
      isDragging.set(false);
      if (barWidth <= 0) return;
      const pos = getTabDragPosition(event.x, barWidth, sideTabs.length);
      const target = nearestTabSlot(pos, sideTabs.length - 1);
      dragSlot.set(target);
      leader.set(target);
      follower.set(reducedMotion ? target : withSpring(target, SNAP_SPRING));
      runOnJS(handleSelectSlot)(target);
    })
    .onFinalize(() => {
      if (isDragging.get()) {
        isDragging.set(false);
        dragSlot.set(currentSlot);
        leader.set(currentSlot);
        follower.set(currentSlot);
      }
    });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          bottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <GestureDetector gesture={dragGesture}>
        <View
          collapsable={false}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          style={styles.tabsRow}
        >
          {sideTabs.map((tab, index) => {
            const isActive = tab.key === activeTab;
            if (tab.key === 'coach') {
              return (
                <CoachButton
                  key={tab.key}
                  tab={tab}
                  slotIndex={index}
                  isActive={isActive}
                  dragSlot={dragSlot}
                  isDragging={isDragging}
                  onPress={() => switchTab(tab.key)}
                  colors={colors}
                />
              );
            }
            return (
              <TabButton
                key={tab.key}
                tab={tab}
                slotIndex={index}
                isActive={isActive}
                dragSlot={dragSlot}
                isDragging={isDragging}
                onPress={() => switchTab(tab.key)}
                colors={colors}
              />
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 28,
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 10.5,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  iconPill: {
    width: 48,
    height: 32,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillFill: {
    borderRadius: 14,
  },
  centerFabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachButton: {
    alignItems: 'center',
    top: -18,
    gap: 3,
  },
  coachCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  coachLabel: {
    marginTop: 1,
  },
});
