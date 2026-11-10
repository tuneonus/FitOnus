import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { Dumbbell, Plus, Search, SearchX } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { FeatureScreen } from '@/shared/components/ui/FeatureScreen';
import { TextField } from '@/shared/components/ui/TextField';
import { Chip } from '@/shared/components/ui/Chip';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { showToast } from '@/shared/stores/toastStore';
import { useWorkoutStore } from '../store/workoutStore';
import { workoutApi } from '../api/workout-api';
import { filterExercises } from '../utils/premium-workout';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

const muscles = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body'];
export function ExerciseLibraryScreen() {
  const { colors } = useTheme();
  const { navigate, goBack } = useNavigation();
  const { pick } = useRouteParams<{ pick?: string }>();
  const { plannedSession, setPlannedSession, catalog: savedCatalog } = useWorkoutStore();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('All');
  const [equipment, setEquipment] = useState('All');
  const library = useQuery({
    queryKey: ['exercises', 'premium-library'],
    queryFn: () => workoutApi.getExercises({ limit: 100 }),
    retry: 1,
  });
  const catalog = library.data?.exercises ?? savedCatalog;
  useEffect(() => {
    if (library.data) useWorkoutStore.setState({ catalog: library.data.exercises });
  }, [library.data]);
  const equipmentOptions = ['All', ...new Set(catalog.map((exercise) => exercise.equipment))];
  const results = filterExercises(catalog, query, muscle, equipment);
  const clear = () => {
    setQuery('');
    setMuscle('All');
    setEquipment('All');
  };
  const add = (id: string) => {
    const currentExercises = plannedSession?.exercises ?? [];
    if (currentExercises.some((exercise) => exercise.exerciseId === id))
      return showToast({ message: 'Already in this workout', tone: 'info' });
    const targetSession: import('../types/workout').WorkoutSession = plannedSession ?? {
      id: `custom-${Date.now()}`,
      title: 'Custom workout',
      focus: 'Custom · 45 min',
      durationMin: 45,
      intensity: 'Moderate',
      exercises: [],
    };
    setPlannedSession({
      ...targetSession,
      exercises: [
        ...targetSession.exercises,
        { exerciseId: id, sets: 3, reps: '10', weight: 0, restSec: 60 },
      ],
    });
    showToast({ message: 'Exercise added' });
    goBack();
  };
  return (
    <FeatureScreen title={pick ? 'Add a movement' : 'Exercise library'}>
      <TextField
        appearance="premium"
        label="Search exercises"
        hideLabel
        placeholder="Search by exercise name"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        trailing={<Search size={20} color={colors.muted} />}
      />
      <Text style={[styles.filterLabel, { color: colors.muted }]}>MUSCLE GROUP</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {muscles.map((value) => (
          <Chip
            appearance="premium"
            key={value}
            selected={muscle === value}
            label={value}
            onPress={() => setMuscle(value)}
          />
        ))}
      </ScrollView>
      <Text style={[styles.filterLabel, { color: colors.muted }]}>EQUIPMENT</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {equipmentOptions.map((value) => (
          <Chip
            appearance="premium"
            key={value}
            selected={equipment === value}
            label={value}
            onPress={() => setEquipment(value)}
          />
        ))}
      </ScrollView>
      {library.isError ? (
        <StatusBanner
          tone="error"
          title="Couldn’t refresh the library"
          body="Showing available exercise options. Try again to load the latest catalog."
          actionLabel="Retry"
          onAction={() => {
            void library.refetch();
          }}
          style={styles.notice}
        />
      ) : null}
      {library.isLoading ? (
        <View
          accessibilityLabel="Loading exercises"
          accessibilityState={{ busy: true }}
          style={styles.list}
        >
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={96} radius={premium.radius.card} />
          ))}
        </View>
      ) : catalog.length === 0 ? (
        <EmptyState
          appearance="premium"
          icon={Dumbbell}
          title="No exercises in library"
          body="No exercises are currently available. Check back soon or contact your coach/admin."
        />
      ) : results.length === 0 ? (
        <EmptyState
          appearance="premium"
          icon={SearchX}
          title="No matching exercises"
          body="Try another name, muscle group or equipment filter."
          actionLabel="Clear filters"
          onAction={clear}
        />
      ) : (
        <View style={styles.list}>
          <Text
            accessibilityLiveRegion="polite"
            style={[premium.type.caption, { color: colors.muted }]}
          >
            {results.length} {results.length === 1 ? 'exercise' : 'exercises'}
          </Text>
          {results.map((exercise) => (
            <View
              key={exercise.id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`View ${exercise.name}`}
                activeOpacity={0.7}
                onPress={() => navigate('exerciseDetail', { id: exercise.id })}
                style={styles.main}
              >
                {exercise.image ? (
                  <Image source={{ uri: exercise.image }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: colors.surface2 }]}>
                    <Dumbbell size={23} color={colors.accentStrong} />
                  </View>
                )}
                <View style={styles.copy}>
                  <Text style={[premium.type.label, { color: colors.ink }]}>{exercise.name}</Text>
                  <Text style={[premium.type.caption, { color: colors.muted }]}>
                    {[exercise.muscle, exercise.equipment, exercise.level]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </TouchableOpacity>
              {pick ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${exercise.name} to workout`}
                  onPress={() => add(exercise.id)}
                  style={[styles.add, { backgroundColor: colors.accent }]}
                >
                  <Plus size={20} color={colors.accentInk} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </FeatureScreen>
  );
}
const styles = StyleSheet.create({
  filterLabel: { ...premium.type.eyebrow, marginTop: 20, marginBottom: 10 },
  filters: { gap: 8, paddingBottom: 4 },
  notice: { marginTop: 20 },
  list: { gap: 12, marginTop: 24, paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: premium.radius.card,
    padding: 16,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  thumb: {
    width: 52,
    height: 64,
    borderRadius: premium.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 6 },
  add: {
    width: 48,
    height: 48,
    borderRadius: premium.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
