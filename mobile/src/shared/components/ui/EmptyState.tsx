import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Button } from './Button';
import { useTheme } from '@/hooks/use-theme';

export type EmptyStateProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  body?: string | undefined;
  description?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  compact?: boolean | undefined;
  style?: ViewStyle | undefined;
};

export function EmptyState({
  icon: Icon,
  title,
  body,
  description,
  actionLabel,
  onAction,
  compact = false,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const textBody = body || description || '';

  return (
    <View
      style={[
        styles.container,
        { paddingVertical: compact ? 24 : 48 },
        style,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.surface2 }]}>
        <Icon size={26} color={colors.ink} />
      </View>

      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.muted }]}>{textBody}</Text>

      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },
  actionButton: {
    marginTop: 20,
  },
});
