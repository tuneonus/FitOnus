import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export const MetricCard = React.memo(({ title, value, subtitle, icon, style }: MetricCardProps) => {
  const { colors } = useTheme();

  return (
    <Card style={[styles.container, style]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: colors.backgroundElement }]}>
          {icon}
        </View>
        <Text variant="labelMedium" color="textSecondary" style={styles.title}>
          {title}
        </Text>
      </View>
      <Text variant="headlineMedium" style={styles.value}>
        {value}
      </Text>
      {subtitle && (
        <Text variant="bodySmall" color="textSecondary">
          {subtitle}
        </Text>
      )}
    </Card>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  title: {
    flex: 1,
  },
  value: {
    marginBottom: 2,
  },
});

MetricCard.displayName = 'MetricCard';
