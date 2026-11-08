import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, Activity, Sparkles, TrendingUp, CircleUserRound } from 'lucide-react-native';
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
  { key: 'coach', label: 'AI Coach', icon: Sparkles },
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
    const isCoach = tab.key === 'coach';
    const iconColor = isCoach ? colors.accentInk : isActive ? colors.accentStrong : colors.muted;

    return (
      <TouchableOpacity
        key={tab.key}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: isActive }}
        onPress={() => switchTab(tab.key)}
        style={styles.tabButton}
      >
        <View
          style={[
            styles.iconPill,
            {
              backgroundColor: isCoach
                ? colors.accent
                : isActive
                  ? `${colors.accent}24`
                  : 'transparent',
            },
          ]}
        >
          <Icon size={22} color={iconColor} strokeWidth={isActive ? 2.3 : 1.8} />
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
      </TouchableOpacity>
    );
  };

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
      <View style={styles.tabsRow}>{sideTabs.map(renderSideTab)}</View>
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
});
