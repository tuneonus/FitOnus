import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

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
            { backgroundColor: colors.surface2 },
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
        <ChevronRight size={18} color={colors.muted} style={styles.chevron} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
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
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
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
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  value: {
    fontSize: 14,
    marginRight: 4,
  },
  chevron: {
    marginLeft: 6,
  },
  group: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 6,
  },
});
