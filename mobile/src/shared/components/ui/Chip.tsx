import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type ChipProps = {
  label?: string | undefined;
  children?: React.ReactNode | undefined;
  selected?: boolean | undefined;
  onPress?: (() => void) | undefined;
  style?: ViewStyle | undefined;
  icon?: React.ComponentType<{ size?: number; color?: string }> | undefined;
};

export function Chip({
  label,
  children,
  selected = false,
  onPress,
  style,
  icon: Icon,
}: ChipProps) {
  const { colors } = useTheme();

  const textLabel = label ?? (typeof children === 'string' ? children : '');
  const bgColor = selected ? colors.ink : colors.surface2;
  const textColor = selected ? colors.bg : colors.muted;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: bgColor,
        },
        style,
      ]}
    >
      {Icon ? <Icon size={14} color={textColor} /> : null}
      <Text style={[styles.label, { color: textColor }]}>{textLabel}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '500',
  },
});
