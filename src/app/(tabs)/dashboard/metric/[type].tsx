import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { ChevronLeft } from 'lucide-react-native';

export default function MetricDetailScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const { colors } = useTheme();
  const router = useRouter();

  // Capitalize first letter of type
  const title = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Metric Detail';

  return (
    <ScreenContainer edges={['top', 'bottom']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: title,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable 
              onPress={() => router.back()} 
              style={{ marginLeft: -Spacing.sm, padding: Spacing.sm }}
            >
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          )
        }} 
      />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.chartPlaceholder}>
          <Text variant="bodyLarge" style={{ color: colors.textSecondary }}>
            {title} Chart Placeholder
          </Text>
        </View>

        <View style={styles.statsContainer}>
          <Text variant="headlineSmall" style={styles.sectionTitle}>Statistics</Text>
          <View style={[styles.statsCard, { backgroundColor: colors.backgroundElement }]}>
            <Text variant="bodyMedium">Average: --</Text>
            <Text variant="bodyMedium">Min: --</Text>
            <Text variant="bodyMedium">Max: --</Text>
          </View>
        </View>

        <View style={styles.historyContainer}>
          <Text variant="headlineSmall" style={styles.sectionTitle}>History</Text>
          <View style={[styles.historyCard, { backgroundColor: colors.backgroundElement }]}>
            <Text variant="bodyMedium" style={{ color: colors.textSecondary }}>
              No history available yet.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  chartPlaceholder: {
    height: 200,
    borderRadius: Spacing.sm,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  statsContainer: {
    marginBottom: Spacing.xl,
  },
  statsCard: {
    padding: Spacing.lg,
    borderRadius: Spacing.md,
  },
  historyContainer: {
    marginBottom: Spacing.xl,
  },
  historyCard: {
    padding: Spacing.lg,
    borderRadius: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  }
});
