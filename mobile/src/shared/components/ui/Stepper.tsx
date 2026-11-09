import { premium } from '@/shared/theme/premium';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

export type StepperProps = {
  appearance?: 'default' | 'premium';
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  decimals?: number;
  size?: 'md' | 'lg';
  style?: ViewStyle;
};

export function Stepper({
  appearance = 'default',
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  unit,
  label,
  decimals = 0,
  size = 'md',
  style,
}: StepperProps) {
  const { colors } = useTheme();

  const isLarge = size === 'lg';
  const buttonSize =
    appearance === 'premium' ? (isLarge ? 54 : premium.layout.touch) : isLarge ? 54 : 40;
  const iconSize = isLarge ? 22 : 18;

  const clamp = (val: number) => {
    const fixed = parseFloat(val.toFixed(decimals));
    return Math.min(max, Math.max(min, fixed));
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label || unit || 'value'}`}
        accessibilityState={{ disabled: value <= min }}
        disabled={value <= min}
        onPress={() => onChange(clamp(value - step))}
        style={[
          styles.button,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            backgroundColor: colors.surface2,
            opacity: value <= min ? 0.35 : 1,
          },
        ]}
      >
        <Minus size={iconSize} color={colors.ink} />
      </TouchableOpacity>

      <View
        style={[styles.valueContainer, appearance === 'premium' && { flex: 1, flexWrap: 'wrap' }]}
        accessible
        accessibilityLabel={`${label || 'Amount'}: ${value} ${unit || ''}`}
      >
        <Text
          style={[
            styles.valueText,
            {
              color: colors.ink,
              fontSize: isLarge ? 48 : 22,
            },
          ]}
        >
          {value.toFixed(decimals)}
        </Text>
        {unit ? (
          <Text
            style={[
              styles.unitText,
              {
                color: colors.muted,
                fontSize: isLarge ? 16 : 13,
              },
            ]}
          >
            {unit}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label || unit || 'value'}`}
        accessibilityState={{ disabled: value >= max }}
        disabled={value >= max}
        onPress={() => onChange(clamp(value + step))}
        style={[
          styles.button,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
            backgroundColor: colors.surface2,
            opacity: value >= max ? 0.35 : 1,
          },
        ]}
      >
        <Plus size={iconSize} color={colors.ink} />
      </TouchableOpacity>
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
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  valueText: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unitText: {
    marginLeft: 4,
    fontWeight: '500',
  },
});
