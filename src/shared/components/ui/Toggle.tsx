import React from 'react';
import { TouchableOpacity, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export type ToggleProps = {
  value?: boolean;
  checked?: boolean;
  onValueChange?: (val: boolean) => void;
  onChange?: (val: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Toggle({
  value,
  checked,
  onValueChange,
  onChange,
  disabled = false,
  style,
}: ToggleProps) {
  const { colors } = useTheme();
  const isChecked = checked !== undefined ? checked : Boolean(value);
  const handleChange = onValueChange || onChange || (() => {});

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={() => handleChange(!isChecked)}
      style={[
        styles.track,
        {
          backgroundColor: isChecked ? colors.ink : colors.surface2,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: isChecked ? colors.accent : colors.surface,
            transform: [{ translateX: isChecked ? 20 : 0 }],
          },
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
