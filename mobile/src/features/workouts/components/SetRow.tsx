import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import type { SetLog } from '../types/workout';
import { parseWorkoutInput } from '../utils/premium-workout';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

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
  caption,
  whole = false,
  onChange,
  onValidityChange,
}: {
  value: number;
  label: string;
  /** Short visible label; `label` remains the full accessibility name. */
  caption: string;
  whole?: boolean;
  onChange: (value: number) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const invalid = parseWorkoutInput(draft, whole) === null;
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  return (
    <View style={styles.field}>
      <Text style={[styles.caption, { color: colors.muted }]}>{caption}</Text>
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
          onValidityChange(parseWorkoutInput(String(value), whole) !== null);
        }}
        onChangeText={(text) => {
          setDraft(text);
          const next = parseWorkoutInput(text, whole);
          onValidityChange(next !== null);
          if (next !== null) onChange(next);
        }}
        style={[
          styles.input,
          {
            color: colors.ink,
            borderColor: invalid ? colors.bad : focused ? colors.accentStrong : 'transparent',
            backgroundColor: focused ? colors.surface : colors.surface2,
          },
        ]}
      />
      {invalid ? (
        <Text accessibilityRole="alert" style={{ ...premium.type.caption, color: colors.bad }}>
          {whole ? 'Whole reps only' : 'Invalid weight'}
        </Text>
      ) : null}
    </View>
  );
}
export function SetRow({ index, set, bodyweight, onChange, onComplete }: Props) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [weightValid, setWeightValid] = useState(Number.isFinite(set.weight) && set.weight >= 0);
  const [repsValid, setRepsValid] = useState(Number.isSafeInteger(set.reps) && set.reps >= 0);
  const stacked = fontScale > 1.3;
  const blocked = !set.done && (!weightValid || !repsValid);
  return (
    <View
      style={[
        styles.card,
        stacked && styles.cardStacked,
        {
          backgroundColor: set.done ? colors.successLight : colors.surface,
          borderColor: set.done ? colors.good : colors.line,
        },
      ]}
    >
      <View
        style={[styles.badge, { backgroundColor: set.done ? colors.good : colors.surface2 }]}
        accessible
        accessibilityLabel={`Set ${index + 1}${set.done ? ', complete' : ''}`}
      >
        {set.done ? (
          <Check size={16} color={colors.surface} strokeWidth={3} />
        ) : (
          <Text style={[styles.badgeText, { color: colors.ink }]}>{index + 1}</Text>
        )}
      </View>
      <View style={[styles.inputs, stacked && styles.stacked]}>
        {bodyweight ? (
          <View style={styles.field}>
            <Text style={[styles.caption, { color: colors.muted }]}>Weight</Text>
            <Text style={[styles.bodyweight, { color: colors.ink }]}>Bodyweight</Text>
          </View>
        ) : (
          <NumericEntry
            onValidityChange={setWeightValid}
            value={set.weight}
            label={`Set ${index + 1} weight (kg)`}
            caption="kg"
            onChange={(weight) => onChange({ weight })}
          />
        )}
        <NumericEntry
          onValidityChange={setRepsValid}
          value={set.reps}
          label={`Set ${index + 1} reps`}
          caption="Reps"
          whole
          onChange={(reps) => onChange({ reps })}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          set.done ? `Set ${index + 1} complete · Undo` : `Complete set ${index + 1}`
        }
        accessibilityState={{ disabled: blocked, checked: set.done }}
        disabled={blocked}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onComplete();
        }}
        style={({ pressed }) => [
          styles.check,
          stacked && styles.checkStacked,
          {
            backgroundColor: set.done ? colors.good : colors.accent,
            opacity: blocked ? 0.4 : pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          },
        ]}
      >
        <Check size={24} color={set.done ? colors.surface : colors.accentInk} strokeWidth={3} />
        {stacked ? (
          <Text
            style={[styles.checkLabel, { color: set.done ? colors.surface : colors.accentInk }]}
          >
            {set.done ? 'Undo' : 'Done'}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderRadius: premium.radius.card,
    marginVertical: 4,
  },
  cardStacked: { flexDirection: 'column', alignItems: 'stretch' },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  badgeText: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  inputs: { flex: 1, flexDirection: 'row', gap: 10 },
  stacked: { flexDirection: 'column' },
  field: { flex: 1, gap: 4 },
  caption: { ...premium.type.caption, fontWeight: '600', marginLeft: 2 },
  input: {
    ...premium.type.metric,
    fontSize: 22,
    textAlign: 'center',
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderRadius: premium.radius.control,
  },
  bodyweight: { ...premium.type.label, minHeight: 56, paddingVertical: 18 },
  check: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkStacked: { width: '100%', flexDirection: 'row', gap: 8 },
  checkLabel: { fontSize: 15, fontWeight: '700' },
});
