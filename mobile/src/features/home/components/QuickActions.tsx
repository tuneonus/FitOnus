import React from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Utensils, Dumbbell, Scale, ChartNoAxesCombined } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { ActionButton } from '@/shared/components/ui/ActionButton';

export function QuickActions({ onLogMeal }: { onLogMeal?: () => void } = {}) {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 375 || fontScale > 1.2;
  const handleLogMeal = onLogMeal ?? (() => navigate('foodSearch'));
  return (
    <View style={styles.container}>
      <ActionButton title="Log a meal" icon={Utensils} onPress={handleLogMeal} />
      <View style={[styles.secondary, compact && styles.wrap]}>
        {(
          [
            { label: 'Workouts', icon: Dumbbell, route: 'workouts' },
            { label: 'Log weight', icon: Scale, route: 'weight' },
            { label: 'Reports', icon: ChartNoAxesCombined, route: 'reports' },
          ] as const
        ).map(({ label, icon: Icon, route }) => (
          <Pressable
            key={route}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => navigate(route)}
            style={({ pressed }) => [
              styles.action,
              compact && styles.compactAction,
              { borderColor: colors.line, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Icon size={18} strokeWidth={1.7} color={colors.ink} />
            <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  secondary: { flexDirection: 'row', gap: 8 },
  wrap: { flexWrap: 'wrap' },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: premium.radius.control,
  },
  compactAction: { flexGrow: 1, flexBasis: '40%' },
  label: { ...premium.type.caption, flexShrink: 1 },
});
