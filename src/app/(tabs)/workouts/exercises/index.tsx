import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TextInput, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Exercise } from '@/features/workouts/types/workout';
import { WorkoutService } from '@/features/workouts/services/workout-service';
import { Search, Filter, Dumbbell } from 'lucide-react-native';

export default function ExerciseLibraryScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  
  useEffect(() => {
    const fetchEx = async () => {
      const data = await WorkoutService.getExercises();
      setExercises(data);
    };
    fetchEx();
  }, []);

  const filtered = exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  const renderExercise = ({ item }: { item: Exercise }) => (
    <Pressable style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSelected }]}>
        <Dumbbell size={24} color={colors.primary} />
      </View>
      <View style={styles.cardInfo}>
        <Text variant="bodyLarge" style={{ color: colors.text, fontWeight: 'bold' }}>{item.name}</Text>
        <Text variant="labelSmall" style={{ color: colors.textSecondary }}>
          {item.primaryMuscles.join(', ')} • {item.equipment}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: colors.backgroundSelected }]}>
        <Text variant="labelSmall" style={{ color: colors.primary, textTransform: 'capitalize' }}>
          {item.difficulty}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'Exercises',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: '',
        }} 
      />

      <View style={styles.header}>
        <View style={[styles.searchBox, { backgroundColor: colors.backgroundElement }]}>
          <Search size={20} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search exercises..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <Pressable style={[styles.filterBtn, { backgroundColor: colors.backgroundElement }]}>
          <Filter size={20} color={colors.text} />
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderExercise}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: 16,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  }
});
