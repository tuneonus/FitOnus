import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useProfile } from '@/features/profile/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export function HomeHeader() {
  const { colors } = useTheme();
  const { navigate, switchTab } = useNavigation();
  const user = useAuthStore((s) => s.user);
  const { data: profile } = useProfile();
  const displayName = (profile?.name || user?.name || '').trim();
  const firstName = displayName.split(/\s+/)[0] || 'there';
  const initials =
    displayName
      .split(/\s+/)
      .map((name) => name[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'F';
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now);

  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          onPress={() => switchTab('profile')}
          style={({ pressed }) => [
            styles.avatar,
            { backgroundColor: colors.hero, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[premium.type.label, { color: colors.heroInk }]}>{initials}</Text>
        </Pressable>
        <View style={styles.brand}>
          <Text style={[styles.greeting, { color: colors.muted }]}>
            {greeting} · {dateLabel}
          </Text>
          <Text accessibilityRole="header" style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
            {firstName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => navigate('notifications')}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.accentSoft, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Bell size={21} color={colors.accentStrong} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 12, paddingBottom: premium.space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { flex: 1 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: { ...premium.type.caption },
  name: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 },
});
