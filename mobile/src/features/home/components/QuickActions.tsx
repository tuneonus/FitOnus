import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Utensils, Dumbbell, Scale, ChartNoAxesCombined } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

/**
 * Pastel tinted tiles (blue / green / orange / blue) with a matching icon,
 * the TuneStack quick-action style. Labels stay in the main ink colour so
 * contrast never depends on the tint.
 */
export function QuickActions({ onLogMeal }: { onLogMeal?: () => void } = {}) {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 375 || fontScale > 1.2;
  const handleLogMeal = onLogMeal ?? (() => navigate('foodSearch'));

  const actions = [
    { label: 'Log a meal', icon: Utensils, tint: colors.accentSoft, fg: colors.accent, onPress: handleLogMeal },
    { label: 'Workouts', icon: Dumbbell, tint: colors.successLight, fg: colors.success, onPress: () => navigate('workouts') },
    { label: 'Log weight', icon: Scale, tint: colors.highlightSoft, fg: colors.highlight, onPress: () => navigate('weight') },
    { label: 'Reports', icon: ChartNoAxesCombined, tint: colors.accentSoft, fg: colors.accent, onPress: () => navigate('reports') },
  ];

  return (
    <View style={styles.container}>
      {actions.map(({ label, icon: Icon, tint, fg, onPress }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={({ pressed }) => [
            styles.tile,
            compact && styles.compactTile,
            { backgroundColor: tint, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Icon size={24} strokeWidth={1.8} color={fg} />
          <Text style={[styles.label, { color: colors.ink }]} numberOfLines={2}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flex: 1,
    minWidth: 72,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 14,
    borderRadius: premium.radius.card,
  },
  compactTile: { flexBasis: '47%' },
  label: { ...premium.type.caption, fontWeight: '700', textAlign: 'center' },
});
