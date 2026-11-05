import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AISummary } from '../api/dashboard-repository';

interface AISummaryCardProps {
  summary: AISummary;
}

export const AISummaryCard = React.memo(({ summary }: AISummaryCardProps) => {
  const { colors } = useTheme();

  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.primary }]}>
          <Sparkles size={16} color="#FFF" />
        </View>
        <Text variant="headlineSmall">AI Coach Summary</Text>
      </View>
      
      <View style={[styles.chatBubble, { backgroundColor: colors.backgroundElement }]}>
        <Text variant="bodyMedium" style={styles.textLine}>
          {summary.greeting}
        </Text>
        <Text variant="bodyMedium" style={styles.textLine}>
          {summary.sleepInsights} {summary.recoveryInsights}
        </Text>
        <Text variant="bodyMedium" color="primary" style={styles.recommendation}>
          {summary.recommendation}
        </Text>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  chatBubble: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderTopLeftRadius: 4,
  },
  textLine: {
    marginBottom: Spacing.xs,
  },
  recommendation: {
    marginTop: Spacing.sm,
    fontWeight: '600',
  },
});

AISummaryCard.displayName = 'AISummaryCard';
