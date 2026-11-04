import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  style?: ViewStyle;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface2 },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            activeOpacity={0.8}
            onPress={() => onChange(option.value)}
            style={[
              styles.optionButton,
              active && [
                styles.activeButton,
                {
                  backgroundColor: colors.surface,
                },
              ],
            ]}
          >
            <Text
              style={[
                styles.optionText,
                {
                  color: active ? colors.ink : colors.muted,
                  fontWeight: active ? '600' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 9999,
    padding: 3,
    alignItems: 'center',
  },
  optionButton: {
    flex: 1,
    height: 36,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  activeButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  optionText: {
    fontSize: 13,
  },
});

