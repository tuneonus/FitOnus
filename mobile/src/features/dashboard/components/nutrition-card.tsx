import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { NutritionSummary } from '../api/dashboard-repository';

interface NutritionCardProps {
  nutrition: NutritionSummary;
}

export const NutritionCard = React.memo(({ nutrition }: NutritionCardProps) => {
  const { colors } = useTheme();

  const renderMacro = (label: string, value: number, goal: number, color: string) => {
    const progress = Math.min(value / goal, 1);
    
    return (
      <View style={styles.macroContainer}>
        <View style={styles.macroHeader}>
          <Text variant="labelMedium" color="textSecondary">{label}</Text>
          <Text variant="labelMedium">{value}g / {goal}g</Text>
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: colors.backgroundElement }]}>
          <View 
            style={[
              styles.progressBarFill, 
              { width: `${progress * 100}%`, backgroundColor: color }
            ]} 
          />
        </View>
      </View>
    );
  };

  const remainingCals = nutrition.caloriesGoal - nutrition.calories;

  return (
    <Card style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>Nutrition</Text>
      
      <View style={styles.caloriesContainer}>
        <View style={styles.caloriesInfo}>
          <Text variant="displaySmall">{nutrition.calories}</Text>
          <Text variant="bodyMedium" color="textSecondary"> / {nutrition.caloriesGoal} kcal</Text>
        </View>
        <Text variant="bodySmall" color={remainingCals < 0 ? 'error' : 'primary'}>
          {Math.abs(remainingCals)} kcal {remainingCals < 0 ? 'over' : 'left'}
        </Text>
      </View>

      <View style={styles.macrosList}>
        {renderMacro('Protein', nutrition.protein, nutrition.proteinGoal, '#F87171')}
        {renderMacro('Carbs', nutrition.carbs, nutrition.carbsGoal, '#60A5FA')}
        {renderMacro('Fat', nutrition.fat, nutrition.fatGoal, '#FBBF24')}
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
  caloriesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.xl,
  },
  caloriesInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  macrosList: {
    gap: Spacing.md,
  },
  macroContainer: {
    width: '100%',
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
});

NutritionCard.displayName = 'NutritionCard';
