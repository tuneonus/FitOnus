import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Calendar, Clock, Trophy } from 'lucide-react-native';

const mockHistory = [
  { id: '1', name: 'Push Hypertrophy', date: 'Today, 8:00 AM', duration: '58m', volume: '4,500 kg', prs: 1 },
  { id: '2', name: 'Pull Strength', date: 'Yesterday, 5:30 PM', duration: '62m', volume: '6,200 kg', prs: 0 },
  { id: '3', name: 'Leg Day', date: 'Monday, 7:00 AM', duration: '75m', volume: '9,100 kg', prs: 2 },
  { id: '4', name: 'Active Recovery', date: 'Sunday, 10:00 AM', duration: '30m', volume: '1,200 kg', prs: 0 },
];

export default function WorkoutHistoryScreen() {
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: typeof mockHistory[0] }) => (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.cardHeader}>
        <Text variant="headlineSmall" style={{ color: colors.text }}>{item.name}</Text>
        <Text variant="labelSmall" style={{ color: colors.textTertiary }}>{item.date}</Text>
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Clock size={16} color={colors.primary} />
          <Text variant="labelMedium" style={{ color: colors.textSecondary, marginLeft: 4 }}>{item.duration}</Text>
        </View>
        <View style={styles.stat}>
          <Text variant="labelMedium" style={{ color: colors.primary, fontWeight: 'bold' }}>Vol:</Text>
          <Text variant="labelMedium" style={{ color: colors.textSecondary, marginLeft: 4 }}>{item.volume}</Text>
        </View>
        {item.prs > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.warningLight }]}>
            <Trophy size={14} color={colors.warning} />
            <Text variant="labelSmall" style={{ color: colors.warning, marginLeft: 4 }}>{item.prs} PR</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'History',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: '',
        }} 
      />

      <FlatList
        data={mockHistory}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: Spacing.md,
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginLeft: 'auto',
  }
});
