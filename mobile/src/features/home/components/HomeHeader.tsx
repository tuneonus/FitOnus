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
        <View style={styles.brand}>
          <Text style={[styles.wordmark, { color: colors.ink }]}>ONUSFIT</Text>
          <Text style={[premium.type.caption, { color: colors.muted }]}>{dateLabel}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => navigate('notifications')}
            style={({ pressed }) => [
              styles.iconButton,
              { borderColor: colors.line, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Bell size={21} color={colors.ink} strokeWidth={1.7} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            onPress={() => switchTab('profile')}
            style={({ pressed }) => [
              styles.avatar,
              { backgroundColor: colors.surface2, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[premium.type.label, { color: colors.ink }]}>{initials}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.greeting, { color: colors.muted }]}>{greeting},</Text>
      <Text accessibilityRole="header" style={[styles.name, { color: colors.ink }]}>
        {firstName}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 12, paddingBottom: premium.space.xl },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 28,
  },
  brand: { flex: 1, gap: 3 },
  wordmark: { ...premium.type.eyebrow, letterSpacing: 2.4 },
  actions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
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
  greeting: { ...premium.type.body },
  name: { ...premium.type.display, marginTop: 2 },
});
