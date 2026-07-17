import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { WorkoutDetail } from '@/features/workouts/types/workout';
import { WorkoutService } from '@/features/workouts/services/workout-service';
import { Loading } from '@/components/ui/loading';
import { Clock, Target, Dumbbell } from 'lucide-react-native';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchDetail = async () => {
      try {
        const data = await WorkoutService.getWorkoutDetail(id);
        setWorkout(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  if (isLoading || !workout) {
    return <Loading fullScreen />;
  }

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: workout.name,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: '',
        }} 
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text variant="bodyLarge" style={{ color: colors.textSecondary, marginBottom: Spacing.xl }}>
          {workout.description}
        </Text>

        <View style={styles.metricsRow}>
          <View style={[styles.metricBox, { backgroundColor: colors.backgroundElement }]}>
            <Clock size={20} color={colors.primary} />
            <Text variant="headlineSmall" style={{ color: colors.text, marginTop: Spacing.sm }}>
              {workout.estimatedDuration}m
            </Text>
            <Text variant="labelSmall" style={{ color: colors.textTertiary }}>Duration</Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: colors.backgroundElement }]}>
            <Dumbbell size={20} color={colors.primary} />
            <Text variant="headlineSmall" style={{ color: colors.text, marginTop: Spacing.sm }}>
              {workout.exercisesCount}
            </Text>
            <Text variant="labelSmall" style={{ color: colors.textTertiary }}>Exercises</Text>
          </View>
          <View style={[styles.metricBox, { backgroundColor: colors.backgroundElement }]}>
            <Target size={20} color={colors.primary} />
            <Text variant="headlineSmall" style={{ color: colors.text, marginTop: Spacing.sm, textTransform: 'capitalize' }}>
              {workout.difficulty}
            </Text>
            <Text variant="labelSmall" style={{ color: colors.textTertiary }}>Level</Text>
          </View>
        </View>

        <Text variant="headlineSmall" style={{ color: colors.text, marginBottom: Spacing.md }}>
          Exercises
        </Text>

        <View style={[styles.exerciseList, { borderColor: colors.border }]}>
          {workout.exercises.map((we, index) => (
            <View 
              key={we.id} 
              style={[
                styles.exerciseItem, 
                { borderBottomColor: colors.border },
                index === workout.exercises.length - 1 && { borderBottomWidth: 0 }
              ]}
            >
              <View style={[styles.exerciseNumber, { backgroundColor: colors.backgroundSelected }]}>
                <Text variant="labelLarge" style={{ color: colors.primary }}>{index + 1}</Text>
              </View>
              <View style={styles.exerciseInfo}>
                <Text variant="bodyLarge" style={{ color: colors.text, fontWeight: 'bold' }}>
                  {we.exercise.name}
                </Text>
                <Text variant="bodyMedium" style={{ color: colors.textSecondary }}>
                  {we.targetSets} sets × {we.targetReps} reps
                </Text>
              </View>
            </View>
          ))}
        </View>
        
        {/* Spacer for bottom bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Start Button */}
      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button 
          title="Start Workout" 
          onPress={() => router.push(`/(tabs)/workouts/${workout.id}/active`)} 
          style={styles.startButton}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  metricBox: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  exerciseList: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  exerciseItem: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  exerciseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  exerciseInfo: {
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl, // extra padding for home indicator
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  startButton: {
    width: '100%',
  }
});
