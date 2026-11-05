import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import dayjs from 'dayjs';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { User } from '@/features/auth/api/auth-repository';

interface DashboardHeaderProps {
  user: User | null;
}

export const DashboardHeader = React.memo(({ user }: DashboardHeaderProps) => {
  const dateStr = dayjs().format('dddd, D MMMM');

  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text variant="bodyMedium" color="textSecondary">
          {dateStr}
        </Text>
        <Text variant="displaySmall" style={styles.greeting}>
          Good morning, {user?.name?.split(' ')[0] || 'User'}!
        </Text>
      </View>
      <View style={styles.avatarContainer}>
        {user?.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text variant="headlineSmall" style={{ color: '#fff' }}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  textContainer: {
    flex: 1,
  },
  greeting: {
    marginTop: 4,
  },
  avatarContainer: {
    marginLeft: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#208AEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

DashboardHeader.displayName = 'DashboardHeader';
