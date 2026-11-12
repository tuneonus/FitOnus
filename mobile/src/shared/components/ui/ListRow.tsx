import React from 'react';
import { Pressable, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export type ListRowProps = {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  iconColor?: string | undefined;
  title: string;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  chevron?: boolean;
  style?: ViewStyle;
};

export function ListRow({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  value,
  trailing,
  onPress,
  destructive = false,
  chevron,
  style,
}: ListRowProps) {
  const { colors } = useTheme();

  const showChevron = chevron ?? Boolean(onPress);
  const titleColor = destructive ? colors.bad : colors.ink;
  const effectiveIconColor = iconColor || titleColor;

  const content = (
    <View style={[styles.row, style]}>
      {Icon ? (
        <View
          style={[
            styles.iconBox,
            { backgroundColor: destructive ? colors.errorLight : colors.surface2 },
          ]}
        >
          <Icon size={18} color={effectiveIconColor} />
        </View>
      ) : null}

      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {subtitle !== undefined && subtitle !== null && subtitle !== '' ? (
          typeof subtitle === 'string' || typeof subtitle === 'number' ? (
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>

      {value !== undefined && value !== null && value !== '' ? (
        typeof value === 'string' || typeof value === 'number' ? (
          <Text style={[styles.value, { color: colors.muted }]}>{value}</Text>
        ) : (
          value
        )
      ) : null}

      {trailing}

      {showChevron ? (
        <ChevronRight size={18} color={colors.muted} strokeWidth={2} style={styles.chevron} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => (pressed ? { backgroundColor: colors.surface2 } : undefined)}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

export function ListGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const rows = React.Children.toArray(children);

  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {rows.map((row, index) => (
        <React.Fragment key={(React.isValidElement(row) && row.key) || index}>
          {index > 0 ? (
            <View style={[styles.separator, { backgroundColor: colors.lineSoft }]} />
          ) : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitle: {
    ...premium.type.caption,
    fontWeight: '400',
    marginTop: 1,
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    marginRight: 4,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    marginLeft: 6,
  },
  group: {
    borderRadius: premium.radius.card,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 6,
  },
  separator: {
    height: 1,
    marginLeft: 16,
  },
});
