import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { WorkoutTemplate } from '../types/workout';
import { Clock, Dumbbell, Sparkles, ChevronRight } from 'lucide-react-native';

interface WorkoutCardProps {
  workout: WorkoutTemplate;
  onPress: () => void;
}

export const WorkoutCard = ({ workout, onPress }: WorkoutCardProps) => {
  const { colors } = useTheme();

  return (
    <Pressable 
      style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          {workout.isAiGenerated && (
            <Sparkles size={16} color={colors.primary} style={styles.sparkleIcon} />
          )}
          <Text variant="headlineSmall" style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
            {workout.name}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.textTertiary} />
      </View>
      
      <Text variant="bodyMedium" style={{ color: colors.textSecondary, marginBottom: Spacing.md }} numberOfLines={2}>
        {workout.description}
      </Text>

      <View style={styles.tagsContainer}>
        {workout.tags.map(tag => (
          <View key={tag} style={[styles.tag, { backgroundColor: colors.backgroundSelected }]}>
            <Text variant="labelSmall" style={{ color: colors.primary }}>{tag}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.metaItem}>
          <Clock size={14} color={colors.textTertiary} />
          <Text variant="labelMedium" style={{ color: colors.textSecondary, marginLeft: 4 }}>
            {workout.estimatedDuration} min
          </Text>
        </View>
        
        <View style={styles.metaItem}>
          <Dumbbell size={14} color={colors.textTertiary} />
          <Text variant="labelMedium" style={{ color: colors.textSecondary, marginLeft: 4 }}>
            {workout.exercisesCount} exercises
          </Text>
        </View>

        <View style={styles.metaItem}>
          <Text variant="labelMedium" style={{ color: colors.textSecondary }}>
            • {workout.difficulty}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: Spacing.sm,
  },
  sparkleIcon: {
    marginRight: Spacing.xs,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  footer: {
    flexDirection: 'row',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});
