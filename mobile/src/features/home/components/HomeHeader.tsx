import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { useUnreadCount } from '../../notifications/store/notificationsStore';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useProfile } from '@/features/profile/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

export function HomeHeader() {
  const { colors } = useTheme();
  const { navigate, switchTab } = useNavigation();
  const unread = useUnreadCount();
  const user = useAuthStore((s) => s.user);
  const { data: profile } = useProfile();

  const displayName = profile?.name || user?.name || 'User';
  const firstName = displayName.split(' ')[0] || 'User';
  const initials =
    displayName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(now);

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={styles.header}>
      <View style={styles.userRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => switchTab('profile')}
          style={[styles.avatar, { backgroundColor: colors.ink }]}
        >
          <Text style={[styles.avatarText, { color: colors.bg }]}>
            {initials}
          </Text>
        </TouchableOpacity>

        <View style={styles.titleColumn}>
          <Text style={[styles.dateText, { color: colors.muted }]}>
            {dateLabel}
          </Text>
          <Text style={[styles.greeting, { color: colors.ink }]}>
            {greeting}, {firstName}
          </Text>
        </View>
      </View>

      <View style={styles.rightActions}>
        <IconButton
          icon={Bell}
          variant="surface"
          onPress={() => navigate('notifications')}
        />
        {unread > 0 && (
          <View style={[styles.badgeDot, { backgroundColor: colors.accent }]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  titleColumn: {
    gap: 2,
  },
  dateText: {
    fontSize: 12.5,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  rightActions: {
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});

