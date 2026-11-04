import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  House,
  Activity,
  Sparkles,
  TrendingUp,
  CircleUserRound,
} from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import type { TabKey } from '../../../app/navigation/routes';
import { useTheme } from '@/hooks/use-theme';

const sideTabs: {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}[] = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'progress', label: 'Progress', icon: TrendingUp },
  { key: 'profile', label: 'Profile', icon: CircleUserRound },
];

export function BottomNav() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { activeTab, switchTab } = useNavigation();

  const renderSideTab = (tab: (typeof sideTabs)[number]) => {
    const isActive = tab.key === activeTab;
    const Icon = tab.icon;
    const iconColor = isActive ? colors.ink : colors.muted;

    return (
      <TouchableOpacity
        key={tab.key}
        activeOpacity={0.7}
        onPress={() => switchTab(tab.key)}
        style={styles.tabButton}
      >
        <Icon
          size={22}
          color={iconColor}
          strokeWidth={isActive ? 2.3 : 1.8}
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color: iconColor,
              fontWeight: isActive ? '700' : '500',
            },
          ]}
        >
          {tab.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const isCoachActive = activeTab === 'coach';

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
        {/* Left side tabs: Home, Activity */}
        {sideTabs.slice(0, 2).map(renderSideTab)}

        {/* Center Raised AI Coach Button */}
        <View style={styles.centerFabContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => switchTab('coach')}
            style={styles.coachButton}
          >
            <View
              style={[
                styles.coachCircle,
                {
                  backgroundColor: colors.accent,
                  borderColor: isCoachActive ? colors.ink : colors.bg,
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

        {/* Right side tabs: Progress, Profile */}
        {sideTabs.slice(2).map(renderSideTab)}
      </View>

      {/* Home indicator bar for platforms needing it */}
      {Platform.OS === 'ios' && insets.bottom === 0 && (
        <View
          style={[
            styles.homeIndicator,
            { backgroundColor: colors.ink },
          ]}
        />
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

