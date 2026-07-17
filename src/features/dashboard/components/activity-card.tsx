import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Dumbbell, Utensils, Scale } from 'lucide-react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { RecentActivity } from '../api/dashboard-repository';

interface ActivityCardProps {
  activity: RecentActivity;
}

export const ActivityCard = React.memo(({ activity }: ActivityCardProps) => {
  const { colors } = useTheme();

  const getIcon = () => {
    switch (activity.type) {
      case 'workout': return <Dumbbell size={20} color={colors.primary} />;
      case 'meal': return <Utensils size={20} color="#F87171" />;
      case 'weight': return <Scale size={20} color="#60A5FA" />;
    }
  };

  const getIconBackground = () => {
    switch (activity.type) {
      case 'workout': return `${colors.primary}20`;
      case 'meal': return '#F8717120';
      case 'weight': return '#60A5FA20';
    }
  };

  return (
    <Card style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: getIconBackground() }]}>
        {getIcon()}
      </View>
      <View style={styles.content}>
        <Text variant="headlineSmall">{activity.title}</Text>
        <Text variant="bodyMedium" color="textSecondary">{activity.subtitle}</Text>
      </View>
      <View style={styles.timestamp}>
        <Text variant="labelSmall" color="textSecondary">{activity.timestamp}</Text>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  timestamp: {
    marginLeft: Spacing.sm,
  },
});

ActivityCard.displayName = 'ActivityCard';
