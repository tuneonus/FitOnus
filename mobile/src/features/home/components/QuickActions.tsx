import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Utensils, Dumbbell, Scale, ChartNoAxesCombined } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';
import type { RouteName } from '@/app/navigation/routes';

const actions = [
  { label: 'Log meal', icon: Utensils, route: 'foodSearch', color: 'move' },
  { label: 'Workouts', icon: Dumbbell, route: 'workouts', color: 'accentStrong' },
  { label: 'Weight', icon: Scale, route: 'weight', color: 'sky' },
  { label: 'Reports', icon: ChartNoAxesCombined, route: 'reports', color: 'sleep' },
] as const satisfies readonly {
  label: string;
  icon: typeof Scale;
  route: RouteName;
  color: 'move' | 'accentStrong' | 'sky' | 'sleep';
}[];

export function QuickActions() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  return (
    <View style={styles.container}>
      {actions.map(({ label, icon: Icon, route, color }) => (
        <TouchableOpacity
          key={route}
          accessibilityRole="button"
          accessibilityLabel={label}
          activeOpacity={0.7}
          onPress={() => navigate(route)}
          style={[styles.action, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={[styles.icon, { backgroundColor: `${colors[color]}15` }]}>
            <Icon size={21} color={colors[color]} strokeWidth={1.8} />
          </View>
          <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 12 },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 3,
    borderWidth: 1,
    borderRadius: 22,
    gap: 9,
  },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
});
