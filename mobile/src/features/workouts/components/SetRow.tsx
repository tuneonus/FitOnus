import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import type { SetLog } from '../types/workout';
import { parseWorkoutInput } from '../utils/premium-workout';
import { useTheme } from '@/hooks/use-theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTween } from '@/hooks/use-tween';
import { Reveal } from '@/shared/components/ui/Reveal';
import { motion } from '@/shared/theme/motion';
import { motionEase } from '@/shared/theme/motion-animations';
import { premium } from '@/shared/theme/premium';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** What the check button did before it was animated: dim to 0.85 and shrink to 0.95 while pressed. */
const PRESSED_OPACITY = 0.85;
const PRESSED_SCALE = 0.95;
/** A set that has just been completed swells from this scale back to 1. */
const DONE_POP_FROM = 0.6;

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

  // Border and fill ease between idle, focused and invalid instead of snapping. The idle border is the field's own
  // fill colour: a transparent border shows the fill through it, so the two look the same.
  const focusT = useTween(focused ? 1 : 0, { durationMs: motion.duration.settle });
  const invalidT = useTween(invalid ? 1 : 0, { durationMs: motion.duration.settle });
  const inputStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      invalidT.get(),
      [0, 1],
      [interpolateColor(focusT.get(), [0, 1], [colors.surface2, colors.accentStrong]), colors.bad],
    ),
    backgroundColor: interpolateColor(focusT.get(), [0, 1], [colors.surface2, colors.surface]),
  }));
  return (
    <View style={styles.field}>
      <Text style={[styles.caption, { color: colors.muted }]}>{caption}</Text>
      <AnimatedTextInput
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
        style={[styles.input, { color: colors.ink }, inputStyle]}
      />
      {invalid ? (
        <Reveal exit>
          <Text accessibilityRole="alert" style={{ ...premium.type.caption, color: colors.bad }}>
            {whole ? 'Whole reps only' : 'Invalid weight'}
          </Text>
        </Reveal>
      ) : null}
    </View>
  );
}
/**
 * Two glyphs stacked in one box that cross-fade as `done` goes 0 -> 1; the finished one also swells by `pop`.
 * Stacking (instead of swapping one icon's colour) keeps the glyph in step with its fading background.
 */
function DoneCrossfade({
  done,
  pop,
  size,
  idle,
  finished,
}: {
  done: SharedValue<number>;
  pop: SharedValue<number>;
  size: number;
  idle: React.ReactNode;
  finished: React.ReactNode;
}) {
  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - done.get() }));
  const finishedStyle = useAnimatedStyle(() => ({
    opacity: done.get(),
    transform: [{ scale: pop.get() }],
  }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View pointerEvents="none" style={[styles.layer, idleStyle]}>
        {idle}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.layer, finishedStyle]}>
        {finished}
      </Animated.View>
    </View>
  );
}

export function SetRow({ index, set, bodyweight, onChange, onComplete }: Props) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const [weightValid, setWeightValid] = useState(Number.isFinite(set.weight) && set.weight >= 0);
  const [repsValid, setRepsValid] = useState(Number.isSafeInteger(set.reps) && set.reps >= 0);
  const stacked = fontScale > 1.3;
  const blocked = !set.done && (!weightValid || !repsValid);

  // Completing a set fades the card, badge and button to their "done" colours and swells the tick once. A row that
  // is already done when it first appears (coming back to an exercise) simply shows its done state.
  const done = useTween(set.done ? 1 : 0, { durationMs: motion.duration.settle });
  const pop = useSharedValue(1);
  const wasDone = useRef(set.done);
  useEffect(() => {
    if (set.done && !wasDone.current && !reduceMotion) {
      pop.set(DONE_POP_FROM);
      pop.set(withSpring(1, motion.spring.bouncy));
    }
    wasDone.current = set.done;
  }, [set.done, reduceMotion, pop]);

  const press = useSharedValue(0);
  const pressedScale = reduceMotion ? 1 : PRESSED_SCALE;

  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(done.get(), [0, 1], [colors.surface, colors.successLight]),
    borderColor: interpolateColor(done.get(), [0, 1], [colors.line, colors.good]),
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(done.get(), [0, 1], [colors.surface2, colors.good]),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(done.get(), [0, 1], [colors.accent, colors.good]),
    opacity: blocked ? 0.4 : interpolate(press.get(), [0, 1], [1, PRESSED_OPACITY]),
    transform: [{ scale: interpolate(press.get(), [0, 1], [1, pressedScale]) }],
  }));
  const checkLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(done.get(), [0, 1], [colors.accentInk, colors.surface]),
  }));

  return (
    <Animated.View style={[styles.card, stacked && styles.cardStacked, cardStyle]}>
      <Animated.View
        style={[styles.badge, badgeStyle]}
        accessible
        accessibilityLabel={`Set ${index + 1}${set.done ? ', complete' : ''}`}
      >
        <DoneCrossfade
          done={done}
          pop={pop}
          size={34}
          idle={<Text style={[styles.badgeText, { color: colors.ink }]}>{index + 1}</Text>}
          finished={<Check size={16} color={colors.surface} strokeWidth={3} />}
        />
      </Animated.View>
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
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={
          set.done ? `Set ${index + 1} complete · Undo` : `Complete set ${index + 1}`
        }
        accessibilityState={{ disabled: blocked, checked: set.done }}
        disabled={blocked}
        onPressIn={() => {
          press.set(
            withTiming(1, { duration: reduceMotion ? 0 : motion.duration.press, easing: motionEase }),
          );
        }}
        onPressOut={() => {
          press.set(
            withTiming(0, { duration: reduceMotion ? 0 : motion.duration.settle, easing: motionEase }),
          );
        }}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onComplete();
        }}
        style={[styles.check, stacked && styles.checkStacked, checkStyle]}
      >
        <DoneCrossfade
          done={done}
          pop={pop}
          size={24}
          idle={<Check size={24} color={colors.accentInk} strokeWidth={3} />}
          finished={<Check size={24} color={colors.surface} strokeWidth={3} />}
        />
        {stacked ? (
          <Animated.Text style={[styles.checkLabel, checkLabelStyle]}>
            {set.done ? 'Undo' : 'Done'}
          </Animated.Text>
        ) : null}
      </AnimatedPressable>
    </Animated.View>
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
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { fontSize: 15, fontWeight: '700' },
});
