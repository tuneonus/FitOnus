import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { WorkoutDetail, LoggedSet } from '@/features/workouts/types/workout';
import { WorkoutService } from '@/features/workouts/services/workout-service';
import { Loading } from '@/components/ui/loading';
import { SetLogger } from '@/features/workouts/components/set-logger';
import { RestTimer } from '@/features/workouts/components/rest-timer';
import { ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [loggedSets, setLoggedSets] = useState<Record<string, LoggedSet[]>>({});
  const [activeRest, setActiveRest] = useState<number | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!id) return;
    const fetchDetail = async () => {
      try {
        const data = await WorkoutService.getWorkoutDetail(id);
        setWorkout(data);
        
        // Initialize empty sets
        const initialSets: Record<string, LoggedSet[]> = {};
        data.exercises.forEach(we => {
          initialSets[we.id] = [];
        });
        setLoggedSets(initialSets);
        
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

  const handleLogSet = (workoutExerciseId: string, setNumber: number, weight: number, reps: number, restSeconds: number) => {
    setLoggedSets(prev => {
      const exerciseSets = [...(prev[workoutExerciseId] || [])];
      exerciseSets[setNumber - 1] = {
        id: `set-${Date.now()}`,
        setNumber,
        weightKg: weight,
        reps,
        isCompleted: true
      };
      return { ...prev, [workoutExerciseId]: exerciseSets };
    });
    
    // Start rest timer
    setActiveRest(restSeconds);
  };

  const handleScroll = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(x / width);
    if (newIndex !== currentExerciseIndex) {
      setCurrentExerciseIndex(newIndex);
      setActiveRest(null); // Clear timer when swiping
    }
  };

  const scrollToExercise = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  const finishWorkout = () => {
    setIsFinished(true);
  };

  const closeWorkout = () => {
    router.dismissAll();
    router.push('/(tabs)/workouts');
  };

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'Active Workout',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ padding: 8, marginLeft: -8 }}>
              <ChevronLeft color={colors.text} size={28} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={finishWorkout} style={{ padding: 8, backgroundColor: colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 16 }}>
              <Text variant="labelMedium" style={{ color: colors.background }}>Finish</Text>
            </Pressable>
          )
        }} 
      />

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {workout.exercises.map((_, idx) => (
          <View 
            key={idx} 
            style={[
              styles.dot, 
              { backgroundColor: idx === currentExerciseIndex ? colors.primary : colors.border },
              idx === currentExerciseIndex && { width: 16 }
            ]} 
          />
        ))}
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={{ flex: 1 }}
        >
          {workout.exercises.map((we, index) => {
            const exerciseSets = loggedSets[we.id] || [];
            
            return (
              <View key={we.id} style={[styles.page, { width }]}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pageScroll}>
                  <Text variant="headlineMedium" style={{ color: colors.text, marginBottom: 4 }}>
                    {we.exercise.name}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: colors.textSecondary, marginBottom: Spacing.xl }}>
                    Target: {we.targetSets} sets × {we.targetReps} reps
                  </Text>

                  {activeRest !== null && currentExerciseIndex === index && (
                    <RestTimer seconds={activeRest} onSkip={() => setActiveRest(null)} />
                  )}

                  {/* Render target sets */}
                  {Array.from({ length: we.targetSets }).map((_, setIdx) => {
                    const setNum = setIdx + 1;
                    const loggedSet = exerciseSets[setIdx];
                    
                    return (
                      <SetLogger 
                        key={`${we.id}-set-${setNum}`}
                        setNumber={setNum}
                        loggedSet={loggedSet}
                        previousWeight={setIdx > 0 ? exerciseSets[setIdx - 1]?.weightKg : undefined}
                        previousReps={setIdx > 0 ? exerciseSets[setIdx - 1]?.reps : undefined}
                        onLog={(w, r) => handleLogSet(we.id, setNum, w, r, we.restSeconds)}
                      />
                    );
                  })}
                  
                  {/* Extra set button */}
                  <Pressable style={[styles.addSetBtn, { borderColor: colors.border }]}>
                    <Text variant="labelLarge" style={{ color: colors.primary }}>+ Add Set</Text>
                  </Pressable>
                  
                  {/* Bottom spacing */}
                  <View style={{ height: 100 }} />
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Navigation arrows overlay */}
      <View style={styles.navArrows} pointerEvents="box-none">
        {currentExerciseIndex > 0 ? (
          <Pressable style={[styles.arrowBtn, { backgroundColor: colors.backgroundElement }]} onPress={() => scrollToExercise(currentExerciseIndex - 1)}>
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
        ) : <View style={styles.arrowBtn} />}
        
        {currentExerciseIndex < workout.exercises.length - 1 ? (
          <Pressable style={[styles.arrowBtn, { backgroundColor: colors.backgroundElement }]} onPress={() => scrollToExercise(currentExerciseIndex + 1)}>
            <ChevronRight size={24} color={colors.text} />
          </Pressable>
        ) : <View style={styles.arrowBtn} />}
      </View>

      {/* Finish Overlay */}
      {isFinished && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
          <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={styles.finishContent}>
            <View style={[styles.successIcon, { backgroundColor: colors.successLight }]}>
              <CheckCircle size={64} color={colors.success} />
            </View>
            <Text variant="headlineLarge" style={{ color: colors.text, textAlign: 'center', marginBottom: Spacing.sm }}>
              Workout Complete!
            </Text>
            <Text variant="bodyLarge" style={{ color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xxl }}>
              Awesome job crushing the {workout.name}.
            </Text>
            <Button title="Done" onPress={closeWorkout} style={{ width: '100%' }} />
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}


const styles = StyleSheet.create({
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  page: {
    flex: 1,
  },
  pageScroll: {
    padding: Spacing.lg,
  },
  addSetBtn: {
    padding: Spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  navArrows: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  arrowBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  finishContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  }
});
