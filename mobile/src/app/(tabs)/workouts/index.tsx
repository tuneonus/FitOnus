import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { WorkoutTemplate } from '@/features/workouts/types/workout';
import { WorkoutService } from '@/features/workouts/services/workout-service';
import { WorkoutCard } from '@/features/workouts/components/workout-card';
import { Loading } from '@/components/ui/loading';
import { History, Library } from 'lucide-react-native';

export default function WorkoutsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [myWorkouts, setMyWorkouts] = useState<WorkoutTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWorkouts = async () => {
      try {
        const [tData, mData] = await Promise.all([
          WorkoutService.getTemplates(),
          WorkoutService.getMyWorkouts()
        ]);
        setTemplates(tData);
        setMyWorkouts(mData);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchWorkouts();
  }, []);

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'Workouts',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }} 
      />

      {isLoading ? (
        <Loading fullScreen />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.quickLinksRow}>
            <Pressable 
              style={[styles.quickLink, { backgroundColor: colors.backgroundElement }]} 
              onPress={() => router.push('/(tabs)/workouts/history')}
            >
              <History size={20} color={colors.primary} />
              <Text variant="labelMedium" style={{ color: colors.text, marginTop: 8 }}>History</Text>
            </Pressable>
            <Pressable 
              style={[styles.quickLink, { backgroundColor: colors.backgroundElement }]} 
              onPress={() => router.push('/(tabs)/workouts/exercises')}
            >
              <Library size={20} color={colors.primary} />
              <Text variant="labelMedium" style={{ color: colors.text, marginTop: 8 }}>Exercises</Text>
            </Pressable>
          </View>

          {myWorkouts.length > 0 && (
            <View style={styles.section}>
              <Text variant="headlineSmall" style={{ color: colors.text, marginBottom: Spacing.md }}>
                My Routines
              </Text>
              {myWorkouts.map(workout => (
                <WorkoutCard 
                  key={workout.id} 
                  workout={workout} 
                  onPress={() => router.push(`/(tabs)/workouts/${workout.id}`)} 
                />
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text variant="headlineSmall" style={{ color: colors.text, marginBottom: Spacing.md }}>
              Curated Templates
            </Text>
            {templates.map(workout => (
              <WorkoutCard 
                key={workout.id} 
                workout={workout} 
                onPress={() => router.push(`/(tabs)/workouts/${workout.id}`)} 
              />
            ))}
          </View>
          
          {/* Spacer for bottom tab bar + FAB padding */}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  quickLinksRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  quickLink: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
