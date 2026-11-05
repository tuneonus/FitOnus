import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Play, Clock, Flame, Dumbbell } from 'lucide-react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TodayWorkout } from '../api/dashboard-repository';

interface WorkoutCardProps {
  workout: TodayWorkout | null;
  onStart: () => void;
}

export const WorkoutCard = React.memo(({ workout, onStart }: WorkoutCardProps) => {
  const { colors } = useTheme();

  if (!workout) {
    return (
      <Card style={styles.container}>
        <Text variant="headlineSmall" style={styles.title}>Today&apos;s Workout</Text>
        <Text variant="bodyMedium" color="textSecondary">Rest day! Take it easy and recover.</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>Today&apos;s Workout</Text>
      
      <View style={styles.content}>
        <Text variant="headlineSmall" style={styles.workoutName}>{workout.name}</Text>
        
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Clock size={16} color={colors.textSecondary} />
            <Text variant="bodySmall" color="textSecondary" style={styles.statText}>
              {workout.duration} min
            </Text>
          </View>
          <View style={styles.statItem}>
            <Dumbbell size={16} color={colors.textSecondary} />
            <Text variant="bodySmall" color="textSecondary" style={styles.statText}>
              {workout.exercises} exercises
            </Text>
          </View>
          <View style={styles.statItem}>
            <Flame size={16} color={colors.textSecondary} />
            <Text variant="bodySmall" color="textSecondary" style={styles.statText}>
              {workout.estimatedCalories} kcal
            </Text>
          </View>
        </View>
        
        <Button
          title="Start Workout"
          leftIcon={<Play size={20} color="#FFF" />}
          onPress={onStart}
          style={styles.startButton}
        />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.md,
  },
  content: {
    gap: Spacing.sm,
  },
  workoutName: {
    marginBottom: Spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    marginLeft: 2,
  },
  startButton: {
    width: '100%',
  },
});

WorkoutCard.displayName = 'WorkoutCard';
