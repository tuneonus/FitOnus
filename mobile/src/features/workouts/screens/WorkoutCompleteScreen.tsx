import { premium } from '@/shared/theme/premium';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trophy } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { AnimatedNumber } from '../../../shared/components/ui/AnimatedNumber';
import { Reveal } from '../../../shared/components/ui/Reveal';
import { showToast } from '../../../shared/stores/toastStore';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../store/workoutStore';
import type { WorkoutLog } from '../types/workout';
import { useTheme } from '@/hooks/use-theme';
import { useAnimatedColor } from '@/hooks/use-animated-color';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { motion } from '@/shared/theme/motion';

const feelings = ['Easy', 'Solid', 'Hard', 'Max effort'];

/** The trophy swells in just after the summary has settled, so the record is the last thing to land. */
const TROPHY_DELAY_MS = 350;
const TROPHY_FROM_SCALE = 0.4;

function PrTrophy({ color }: { color: string }) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(reduceMotion ? 1 : TROPHY_FROM_SCALE);
  useEffect(() => {
    scale.set(reduceMotion ? 1 : withDelay(TROPHY_DELAY_MS, withSpring(1, motion.spring.bouncy)));
  }, [reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={style}>
      <Trophy size={22} color={color} />
    </Animated.View>
  );
}

/** One answer to "How did it feel?". Fill and text colours fade when it is picked or dropped. */
function FeelButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fill = useAnimatedColor(selected ? colors.highlight : `${colors.heroInk}10`);
  const ink = useAnimatedColor(selected ? colors.highlightInk : colors.heroInk);
  const fillStyle = useAnimatedStyle(() => ({ backgroundColor: fill.get() }));
  const inkStyle = useAnimatedStyle(() => ({ color: ink.get() }));
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.feelSlot}
    >
      <Animated.View style={[styles.feelBtn, fillStyle]}>
        <Animated.Text
          style={[styles.feelText, { fontWeight: selected ? '600' : '400' }, inkStyle]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function WorkoutCompleteScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { reset } = useNavigation();
  const { lastCompleted: finished, saveCompleted } = useWorkoutStore();
  const hasDevice = useHasDeviceData();
  const [feel, setFeel] = useState('Solid');
  const [discard, setDiscard] = useState(false);
  const saved = useRef(false);
  const [saving, setSaving] = useState(false);

  if (!finished) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.hero,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 20),
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
          },
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.highlight, marginBottom: 8 }]}>
          No active session
        </Text>
        <Text
          style={[
            styles.heading,
            styles.emptyHeading,
            { color: colors.heroInk, textAlign: 'center', marginBottom: 24 },
          ]}
        >
          No recently completed workout found
        </Text>
        <Button
          appearance="premium"
          title="Go to Workouts"
          onPress={() => reset('workouts')}
          style={{ alignSelf: 'center' }}
        />
      </View>
    );
  }

  const lastCompleted = finished;

  // Numbers count up on arrival; `format` is what each one always read, so the final text is unchanged.
  const stats: { label: string; value: number | null; format?: (n: number) => string; unit: string }[] = [
    { label: 'Duration', value: lastCompleted.durationMin, unit: 'min' },
    {
      label: 'Volume',
      value: lastCompleted.volumeKg,
      format: (n) => n.toLocaleString(),
      unit: 'kg',
    },
    { label: 'Sets', value: lastCompleted.sets, unit: '' },
    {
      label: 'Calories',
      value: lastCompleted.pendingSync ? null : lastCompleted.calories,
      unit: lastCompleted.pendingSync ? '' : 'kcal',
    },
  ];

  const save = async () => {
    if (saved.current || lastCompleted.sets <= 0) return;
    saved.current = true;
    setSaving(true);
    const success = await saveCompleted(`Effort: ${feel}`);
    setSaving(false);
    if (success) reset('home');
    else saved.current = false;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.hero,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 20),
        },
      ]}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0}>
          <Text style={[styles.eyebrow, { color: colors.highlight }]}>Workout complete</Text>
          <Text style={[styles.heading, { color: colors.heroInk }]}>{lastCompleted.title}</Text>
        </Reveal>

        {/* Stats Grid */}
        <Reveal
          index={1}
          style={[styles.statsGrid, { backgroundColor: `${colors.heroInk}15` }]}
        >
          {stats.map((s) => (
            <View key={s.label} style={[styles.statBox, { backgroundColor: colors.hero }]}>
              <Text style={[styles.statLabel, { color: colors.heroMuted }]}>{s.label}</Text>
              <Text style={[styles.statNumber, { color: colors.heroInk }]}>
                {s.value === null ? (
                  '—'
                ) : (
                  <AnimatedNumber value={s.value} format={s.format} />
                )}
                <Text style={[styles.statUnit, { color: colors.heroMuted }]}> {s.unit}</Text>
              </Text>
            </View>
          ))}
        </Reveal>

        <Reveal index={2} style={{ marginTop: 10 }}>
          <SourceTag
            source={
              lastCompleted.caloriesSource === 'wearable'
                ? { kind: 'synced', label: 'Calories from your connected device' }
                : {
                    kind: 'estimated',
                    label: lastCompleted.pendingSync
                      ? 'Calories available after sync'
                      : 'Calories estimated from your logged session',
                  }
            }
          />
        </Reveal>

        {/* PR or Volume notice */}
        {lastCompleted.prs > 0 ? (
          <Reveal
            index={3}
            style={[styles.prNotice, { backgroundColor: `${colors.highlight}20` }]}
          >
            <PrTrophy color={colors.highlight} />
            <Text style={[styles.prText, { color: colors.heroInk }]}>
              {lastCompleted.prs} personal record{lastCompleted.prs === 1 ? '' : 's'} recorded
            </Text>
          </Reveal>
        ) : (
          <Reveal index={3} style={[styles.noPrNotice, { backgroundColor: `${colors.heroInk}10` }]}>
            <Text style={[styles.noPrText, { color: colors.heroMuted }]}>
              Your logged sets and training volume are ready to save. Keep building your own
              progress.
            </Text>
          </Reveal>
        )}

        {/* Exercises summary */}
        <Reveal index={4}>
          <Text style={[styles.exercisesTitle, { color: colors.heroInk }]}>Exercises</Text>
        </Reveal>
        <Reveal index={4} style={styles.exercisesList}>
          {lastCompleted.exercises.map((e, idx) => (
            <View
              key={e.name}
              style={[
                styles.exRow,
                idx > 0 && {
                  borderTopWidth: 1,
                  borderTopColor: `${colors.heroInk}15`,
                },
              ]}
            >
              <Text style={[styles.exRowName, { color: colors.heroInk }]}>{e.name}</Text>
              <Text style={[styles.exRowBest, { color: colors.heroMuted }]}>{e.best}</Text>
            </View>
          ))}
        </Reveal>

        {/* How did it feel? */}
        <Reveal index={5} style={styles.feelSection}>
          <Text style={[styles.feelTitle, { color: colors.heroInk }]}>How did it feel?</Text>
          <View style={styles.feelGrid}>
            {feelings.map((f) => (
              <FeelButton key={f} label={f} selected={feel === f} onPress={() => setFeel(f)} />
            ))}
          </View>
        </Reveal>
      </ScrollView>

      {/* Bottom Save & Discard buttons */}
      <View style={styles.bottomBar}>
        <Button
          appearance="premium"
          size="lg"
          fullWidth
          disabled={lastCompleted.sets <= 0}
          loading={saving}
          title="Save workout"
          onPress={save}
        />
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setDiscard(true)}
          style={styles.discardBtn}
        >
          <Text style={[styles.discardText, { color: colors.heroMuted }]}>Discard</Text>
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        open={discard}
        title="Discard this workout?"
        message="Sets and duration won’t be saved, and your streak won’t update."
        confirmLabel="Discard"
        destructive
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          useWorkoutStore.setState({
            todayStatus: 'notStarted',
            active: [],
            elapsedSec: 0,
            lastCompleted: null,
          });
          reset('home');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  eyebrow: {
    ...premium.type.body,
  },
  heading: {
    ...premium.type.display,
    marginTop: 4,
  },
  emptyHeading: {
    ...premium.type.title,
    fontSize: 26,
    lineHeight: 32,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: premium.radius.card,
    overflow: 'hidden',
    marginTop: 20,
    gap: 1,
  },
  statBox: {
    flexBasis: '45%',
    flexGrow: 1,
    padding: 16,
  },
  statLabel: {
    ...premium.type.caption,
  },
  statNumber: {
    ...premium.type.metric,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  statUnit: {
    ...premium.type.caption,
  },
  prNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    padding: 16,
    marginTop: 20,
  },
  prText: {
    ...premium.type.body,
    flex: 1,
  },
  noPrNotice: {
    borderRadius: 18,
    padding: 16,
    marginTop: 20,
  },
  noPrText: {
    ...premium.type.body,
  },
  exercisesTitle: {
    ...premium.type.body,
    marginTop: 24,
  },
  exercisesList: {
    marginTop: 8,
  },
  exRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  exRowName: {
    ...premium.type.body,
    flex: 1,
  },
  exRowBest: {
    ...premium.type.caption,
    fontVariant: ['tabular-nums'],
  },
  feelSection: {
    marginTop: 24,
  },
  feelTitle: {
    ...premium.type.body,
  },
  feelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  feelSlot: {
    flex: 1,
  },
  feelBtn: {
    minHeight: premium.layout.touch,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feelText: {
    ...premium.type.caption,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  discardBtn: {
    minHeight: premium.layout.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardText: {
    ...premium.type.body,
  },
});
