import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image } from 'react-native';
import { Dumbbell, Plus, Search, SearchX } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { TextField } from '../../../shared/components/ui/TextField';
import { Chip } from '../../../shared/components/ui/Chip';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { showToast } from '../../../shared/stores/toastStore';
import { exercises } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';
import { useTheme } from '@/hooks/use-theme';

const muscles = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Full body'];

export function ExerciseLibraryScreen() {
  const { colors } = useTheme();
  const { navigate, goBack } = useNavigation();
  const { pick } = useRouteParams<{ pick?: string }>();
  const { plannedSession, setPlannedSession } = useWorkoutStore();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('All');

  const results = exercises.filter(
    (e) =>
      (muscle === 'All' || e.muscle === muscle) &&
      e.name.toLowerCase().includes(query.toLowerCase())
  );

  const add = (id: string) => {
    if (plannedSession.exercises.some((e) => e.exerciseId === id)) {
      return showToast({ message: 'Already in this workout', tone: 'info' });
    }
    setPlannedSession({
      ...plannedSession,
      exercises: [
        ...plannedSession.exercises,
        { exerciseId: id, sets: 3, reps: '10', weight: 0, restSec: 60 },
      ],
    });
    showToast({ message: 'Exercise added' });
    goBack();
  };

  return (
    <Screen title={pick ? 'Add exercise' : 'Exercise library'}>
      <View style={styles.searchWrap}>
        <TextField
          label="Search exercises"
          hideLabel
          placeholder="Search exercises"
          value={query}
          onChangeText={setQuery}
          trailing={<Search size={18} color={colors.muted} />}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {muscles.map((m) => (
          <Chip
            key={m}
            selected={muscle === m}
            label={m}
            onPress={() => setMuscle(m)}
          />
        ))}
      </ScrollView>

      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No exercises found"
          body="Try another name or clear the muscle filter."
          actionLabel="Clear filters"
          onAction={() => {
            setQuery('');
            setMuscle('All');
          }}
        />
      ) : (
        <View style={styles.listContainer}>
          {results.map((e, idx) => (
            <View
              key={e.id}
              style={[
                styles.itemRow,
                idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigate('exerciseDetail', { id: e.id })}
                style={styles.itemMain}
              >
                {e.image ? (
                  <Image source={{ uri: e.image }} style={styles.thumbImage} />
                ) : (
                  <View
                    style={[
                      styles.thumbBox,
                      { backgroundColor: colors.surface2 },
                    ]}
                  >
                    <Dumbbell size={20} color={colors.muted} />
                  </View>
                )}
                <View style={styles.itemTextCol}>
                  <Text
                    style={[styles.itemName, { color: colors.ink }]}
                    numberOfLines={1}
                  >
                    {e.name}
                  </Text>
                  <Text style={[styles.itemSub, { color: colors.muted }]}>
                    {e.muscle} · {e.equipment} · {e.level}
                  </Text>
                </View>
              </TouchableOpacity>

              {Boolean(pick) && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => add(e.id)}
                  style={[
                    styles.addBtn,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <Plus size={18} color={colors.accentInk} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: 16,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 12,
  },
  listContainer: {
    paddingHorizontal: 16,
    marginTop: 16,
    paddingBottom: 32,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumbImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  thumbBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextCol: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

