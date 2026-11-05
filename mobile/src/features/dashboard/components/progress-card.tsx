import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { ActivityProgress } from '../api/dashboard-repository';

interface ProgressCardProps {
  progress: ActivityProgress;
}

export const ProgressCard = React.memo(({ progress }: ProgressCardProps) => {
  return (
    <Card style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>Activity Progress</Text>
      
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text variant="displayMedium" color="primary">
            {Math.round(progress.dailyGoalProgress * 100)}%
          </Text>
          <Text variant="labelMedium" color="textSecondary">Daily Goal</Text>
        </View>
        
        <View style={styles.metric}>
          <Text variant="displayMedium" color="primary">
            {Math.round(progress.weeklyGoalProgress * 100)}%
          </Text>
          <Text variant="labelMedium" color="textSecondary">Weekly Goal</Text>
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  metric: {
    alignItems: 'center',
  },
});

ProgressCard.displayName = 'ProgressCard';
