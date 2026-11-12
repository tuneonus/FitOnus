import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Button } from './Button';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { ActionButton } from './ActionButton';

export type EmptyStateProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  body?: string | undefined;
  description?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  compact?: boolean | undefined;
  style?: ViewStyle | undefined;
  appearance?: 'default' | 'premium';
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
  appearance = 'default',
}: EmptyStateProps) {
  const { colors } = useTheme();
  const textBody = body || description || '';

  return (
    <View style={[styles.container, { paddingVertical: compact ? 24 : 48 }, style]}>
      <View style={[styles.iconBox, { backgroundColor: colors.accentSoft }]}>
        <Icon size={24} color={colors.accentStrong} />
      </View>

      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        {title}
      </Text>
      {textBody ? <Text style={[styles.body, { color: colors.muted }]}>{textBody}</Text> : null}

      {actionLabel && onAction ? (
        appearance === 'premium' ? (
          <ActionButton title={actionLabel} onPress={onAction} style={styles.actionButton} />
        ) : (
          <Button title={actionLabel} onPress={onAction} style={styles.actionButton} />
        )
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
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    ...premium.type.cardTitle,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    ...premium.type.bodySm,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 300,
  },
  actionButton: {
    marginTop: 20,
    alignSelf: 'center',
  },
});
