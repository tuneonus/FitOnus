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
  appearance = 'default',
}: SectionHeaderProps) {
  const { colors } = useTheme();
  const label = actionLabel || action;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleColumn}>
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            appearance === 'premium' && premium.type.title,
            { color: colors.ink },
          ]}
        >
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
          style={appearance === 'premium' ? styles.premiumAction : undefined}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.action, { color: colors.ink }]}>{label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  titleColumn: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  action: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  premiumAction: {
    minHeight: premium.layout.touch,
    minWidth: premium.layout.touch,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: premium.space.md,
  },
});
