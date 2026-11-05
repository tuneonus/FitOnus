import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '../ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export const EmptyState = ({ title, message, icon, action, style }: EmptyStateProps) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      
      {title && (
        <Text variant="headlineMedium" color="text" align="center" style={styles.title}>
          {title}
        </Text>
      )}
      
      <Text variant="bodyLarge" color="textSecondary" align="center" style={styles.message}>
        {message}
      </Text>
      
      {action && <View style={styles.actionContainer}>{action}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  message: {
    marginBottom: Spacing.xl,
  },
  actionContainer: {
    marginTop: Spacing.md,
  },
});
