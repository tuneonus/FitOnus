import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface QuickActionCardProps {
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
}

export const QuickActionCard = React.memo(({ title, icon, onPress }: QuickActionCardProps) => {
  const { colors } = useTheme();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.container}>
      <Card style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        {icon}
        <Text variant="labelMedium" align="center" style={styles.title}>{title}</Text>
      </Card>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: 4,
  },
  card: {
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  title: {
    marginTop: Spacing.xs,
  },
});

QuickActionCard.displayName = 'QuickActionCard';
