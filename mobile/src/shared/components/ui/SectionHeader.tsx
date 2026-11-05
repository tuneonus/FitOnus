import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
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
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {label && onAction ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onAction}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.action, { color: colors.ink }]}>
            {label}
          </Text>
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
});
