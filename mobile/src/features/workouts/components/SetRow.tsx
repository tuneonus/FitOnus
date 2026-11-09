import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import { Check } from 'lucide-react-native';
import type { SetLog } from '../types/workout';
import { parseWorkoutInput } from '../utils/premium-workout';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { ActionButton } from '@/shared/components/ui/ActionButton';

type Props = {
  index: number;
  set: SetLog;
  bodyweight: boolean;
  onChange: (patch: Partial<SetLog>) => void;
  onComplete: () => void;
};
function NumericEntry({
  value,
  label,
  whole = false,
  onChange,
}: {
  value: number;
  label: string;
  whole?: boolean;
  onChange: (value: number) => void;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  return (
    <View style={styles.field}>
      <Text style={[premium.type.caption, { color: colors.muted }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        selectTextOnFocus
        keyboardType={whole ? 'number-pad' : 'decimal-pad'}
        inputMode={whole ? 'numeric' : 'decimal'}
        returnKeyType="done"
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDraft(String(value));
        }}
        onChangeText={(text) => {
          setDraft(text);
          const next = parseWorkoutInput(text, whole);
          if (next !== null) onChange(next);
        }}
        style={[
          styles.input,
          {
            color: colors.ink,
            borderColor: focused ? colors.accentStrong : colors.line,
            backgroundColor: colors.bg,
          },
        ]}
      />
    </View>
  );
}
export function SetRow({ index, set, bodyweight, onChange, onComplete }: Props) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: set.done ? colors.successLight : colors.surface,
          borderColor: set.done ? colors.good : colors.line,
        },
      ]}
    >
      <Text style={[premium.type.eyebrow, { color: colors.muted }]}>
        SET {index + 1}
        {set.done ? ' · COMPLETE' : ''}
      </Text>
      <View style={[styles.inputs, fontScale > 1.3 && styles.stacked]}>
        {bodyweight ? (
          <View style={styles.field}>
            <Text style={[premium.type.caption, { color: colors.muted }]}>Weight</Text>
            <Text style={[styles.bodyweight, { color: colors.ink }]}>Bodyweight</Text>
          </View>
        ) : (
          <NumericEntry
            value={set.weight}
            label={`Set ${index + 1} weight (kg)`}
            onChange={(weight) => onChange({ weight })}
          />
        )}
        <NumericEntry
          value={set.reps}
          label={`Set ${index + 1} reps`}
          whole
          onChange={(reps) => onChange({ reps })}
        />
      </View>
      <ActionButton
        icon={Check}
        title={set.done ? `Set ${index + 1} complete · Undo` : `Complete set ${index + 1}`}
        variant={set.done ? 'secondary' : 'primary'}
        onPress={onComplete}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderRadius: premium.radius.card,
    marginVertical: 4,
  },
  inputs: { flexDirection: 'row', gap: 12 },
  stacked: { flexDirection: 'column' },
  field: { flex: 1, gap: 6 },
  input: {
    ...premium.type.metric,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderRadius: premium.radius.control,
  },
  bodyweight: { ...premium.type.label, minHeight: 56, paddingVertical: 16 },
});
