import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { House, Activity, Sparkles, TrendingUp, CircleUserRound } from 'lucide-react-native';
export default function LiquidTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Find routes corresponding to our 5 tabs
  const tabConfig: Record<string, { label: string; icon: any }> = {
    home: { label: 'Home', icon: House },
    activity: { label: 'Activity', icon: Activity },
    coach: { label: 'AI Coach', icon: Sparkles },
    progress: { label: 'Progress', icon: TrendingUp },
    profile: { label: 'Profile', icon: CircleUserRound },
    // Aliases
    dashboard: { label: 'Home', icon: House },
    workouts: { label: 'Activity', icon: Activity },
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View style={styles.tabsRow}>
        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const config = tabConfig[route.name] || {
            label: options.title || route.name,
            icon: House,
          };
          const Icon = config.icon;
          const isCoach = route.name === 'coach';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (isCoach) {
            return (
              <View key={route.key} style={styles.centerFabContainer}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={onPress}
                  style={styles.coachButton}
                >
                  <View
                    style={[
                      styles.coachCircle,
                      {
                        backgroundColor: colors.accent,
                        borderColor: isFocused ? colors.ink : colors.bg,
                      },
                    ]}
                  >
                    <Sparkles
                      size={26}
                      color={colors.accentInk}
                      strokeWidth={2.2}
                    />
                  </View>
                  <Text style={[styles.coachLabel, { color: colors.ink }]}>
                    AI Coach
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }

          const iconColor = isFocused ? colors.ink : colors.muted;

          return (
            <TouchableOpacity
              key={route.key}
              activeOpacity={0.7}
              onPress={onPress}
              style={styles.tabButton}
            >
              <Icon
                size={22}
                color={iconColor}
                strokeWidth={isFocused ? 2.3 : 1.8}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: iconColor,
                    fontWeight: isFocused ? '700' : '500',
                  },
                ]}
              >
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {Platform.OS === 'ios' && insets.bottom === 0 && (
        <View style={[styles.homeIndicator, { backgroundColor: colors.ink }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 10,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 56,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: -0.1,
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
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C8F53C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  coachLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  homeIndicator: {
    width: 134,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 4,
  },
});
