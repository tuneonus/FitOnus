import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
  appearance?: 'default' | 'premium';
};

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  action,
  onAction,
  style,
}: SectionHeaderProps) {
  const { colors } = useTheme();
  const label = actionLabel || action;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleColumn}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
        ) : null}
      </View>

      {label && onAction ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${title}`}
          style={styles.actionHit}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.action, { color: colors.accentStrong }]}>{label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 10,
  },
  titleColumn: {
    flex: 1,
  },
  title: {
    ...premium.type.heading,
  },
  subtitle: {
    ...premium.type.caption,
    marginTop: 2,
  },
  action: {
    ...premium.type.label,
    fontSize: 13.5,
  },
  actionHit: {
    minHeight: 32,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: premium.space.md,
  },
});
