import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCoachInsights } from '@/features/ai-coach/hooks/use-coach-insights';
import type { AISummary } from '../api/dashboard-repository';

interface AISummaryCardProps {
  summary?: AISummary;
}

export const AISummaryCard = React.memo(({ summary }: AISummaryCardProps) => {
  const { colors } = useTheme();
  const { data: realInsights, isLoading } = useCoachInsights();

  const greeting = realInsights?.greeting || summary?.greeting || 'Hello Athlete!';
  const recommendation = realInsights?.recommendation || summary?.recommendation;
  const insightsText = realInsights?.insights?.length
    ? realInsights.insights.map((i) => i.description).slice(0, 2).join(' ')
    : '';

  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.primary }]}>
          <Sparkles size={16} color="#FFF" />
        </View>
        <Text variant="headlineSmall">AI Coach Summary</Text>
      </View>

      <View style={[styles.chatBubble, { backgroundColor: colors.backgroundElement }]}>
        {isLoading && !realInsights ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="bodyMedium" color="muted">
              Analyzing today's progress...
            </Text>
          </View>
        ) : (
          <>
            <Text variant="bodyMedium" style={styles.textLine}>
              {greeting}
            </Text>
            {insightsText.length > 0 && (
              <Text variant="bodyMedium" style={styles.textLine}>
                {insightsText}
              </Text>
            )}
            {recommendation && (
              <Text variant="bodyMedium" color="primary" style={styles.recommendation}>
                {recommendation}
              </Text>
            )}
          </>
        )}
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
});

AISummaryCard.displayName = 'AISummaryCard';

