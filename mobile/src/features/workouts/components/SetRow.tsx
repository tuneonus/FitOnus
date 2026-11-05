import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, Minus, Plus } from 'lucide-react-native';
import type { SetLog } from '../types/workout';
import { useTheme } from '@/hooks/use-theme';

type SetRowProps = {
  index: number;
  set: SetLog;
  bodyweight: boolean;
  onChange: (patch: Partial<SetLog>) => void;
  onComplete: () => void;
};

function Adjust({
  value,
  onChange,
  step,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  label: string;
  unit?: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.adjustRow}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onChange(Math.max(0, +(value - step).toFixed(1)))}
        style={[styles.stepperBtn, { backgroundColor: colors.surface2 }]}
      >
        <Minus size={13} color={colors.ink} />
      </TouchableOpacity>

      <View style={styles.valueWrap}>
        <Text style={[styles.adjustVal, { color: colors.ink }]}>
          {value}
          {unit ? <Text style={[styles.unit, { color: colors.muted }]}> {unit}</Text> : null}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onChange(+(value + step).toFixed(1))}
        style={[styles.stepperBtn, { backgroundColor: colors.surface2 }]}
      >
        <Plus size={13} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

export function SetRow({
  index,
  set,
  bodyweight,
  onChange,
  onComplete,
}: SetRowProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: set.done ? `${colors.good}15` : colors.surface,
          borderColor: colors.line,
        },
      ]}
    >
      <Text style={[styles.setIndex, { color: colors.muted }]}>
        {index + 1}
      </Text>

      <View style={styles.adjustCol}>
        {bodyweight ? (
          <Text style={[styles.bodyweightLabel, { color: colors.muted }]}>
            Bodyweight
          </Text>
        ) : (
          <Adjust
            value={set.weight}
            onChange={(weight) => onChange({ weight })}
            step={2.5}
            label={`Set ${index + 1} weight`}
            unit="kg"
          />
        )}
        <Adjust
          value={set.reps}
          onChange={(reps) => onChange({ reps })}
          step={1}
          label={`Set ${index + 1} reps`}
        />
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onComplete}
        style={[
          styles.checkBtn,
          {
            borderColor: set.done ? colors.good : colors.line,
            backgroundColor: set.done ? colors.good : 'transparent',
          },
        ]}
      >
        <Check
          size={18}
          strokeWidth={3}
          color={set.done ? '#FFFFFF' : colors.muted}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    marginVertical: 4,
  },
  setIndex: {
    width: 24,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  adjustCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  bodyweightLabel: {
    width: 100,
    textAlign: 'center',
    fontSize: 13,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustVal: {
    fontSize: 14.5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  unit: {
    fontSize: 10,
    fontWeight: '400',
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

