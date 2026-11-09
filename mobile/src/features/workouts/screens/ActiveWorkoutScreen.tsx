import { premium } from '@/shared/theme/premium';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Pause, Play, Plus, SkipForward } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { FeatureScreen } from '@/shared/components/ui/FeatureScreen';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Dumbbell } from 'lucide-react-native';
import { Button } from '../../../shared/components/ui/Button';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { useWorkoutStore } from '../store/workoutStore';
import { useRestTimer } from '../hooks/useRestTimer';
import { SetRow } from '../components/SetRow';
import { RestTimer } from '../components/RestTimer';
import { useTheme } from '@/hooks/use-theme';

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function ActiveWorkoutScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { goBack, replace } = useNavigation();
  const store = useWorkoutStore();
  const startSession = store.startSession;
  const { active, currentIndex, elapsedSec, paused, plannedSession, getExerciseById } = store;
  const restTimer = useRestTimer();
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    startSession();
  }, [startSession]);

  useEffect(() => {
    const t = setInterval(() => useWorkoutStore.getState().tick(), 1000);
    return () => clearInterval(t);
  }, []);

  const current = active[currentIndex];
  if (!current)
    return (
      <FeatureScreen title="Your workout">
        <EmptyState
          appearance="premium"
          icon={Dumbbell}
          title="Choose a workout first"
          body="Build or select a plan to start logging your sets."
          actionLabel="Browse workouts"
          onAction={() => replace('workouts')}
        />
      </FeatureScreen>
    );
  const ex = getExerciseById(current.exerciseId);
  const doneSets = active.flatMap((e) => e.sets).filter((s) => s.done).length;
  const totalSets = active.filter((e) => !e.skipped).flatMap((e) => e.sets).length;
  const next = active[currentIndex + 1];

  const completeSet = (i: number) => {
    const wasDone = current.sets[i]?.done;
    store.updateSet(currentIndex, i, { done: !wasDone });
    if (!wasDone) restTimer.start(current.restSec);
  };

  const finish = () => {
    store.finishSession();
    replace('workoutComplete');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          paddingTop: insets.top,
        },
      ]}
    >
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to workout plan"
          onPress={goBack}
          style={styles.headerBtn}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </TouchableOpacity>

        <View style={styles.timerCol}>
          <Text style={[styles.timerSub, { color: colors.muted }]}>{plannedSession.title}</Text>
          <Text style={[styles.timerDigits, { color: paused ? colors.warn : colors.ink }]}>
            {fmt(elapsedSec)}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume workout timer' : 'Pause workout timer'}
          onPress={store.togglePause}
          style={[styles.pauseBtn, { backgroundColor: colors.surface2 }]}
        >
          {paused ? <Play size={18} color={colors.ink} /> : <Pause size={18} color={colors.ink} />}
        </TouchableOpacity>
      </View>

      {/* Exercise Indicator Strip */}
      <View style={styles.stripRow}>
        {active.map((e, i) => {
          const complete = e.sets.every((s) => s.done);
          return (
            <TouchableOpacity
              key={e.exerciseId}
              accessibilityRole="button"
              accessibilityLabel={`Go to exercise ${i + 1}: ${getExerciseById(e.exerciseId).name}`}
              accessibilityState={{ selected: i === currentIndex }}
              activeOpacity={0.7}
              onPress={() => store.setCurrentIndex(i)}
              style={[
                styles.stripBar,
                {
                  backgroundColor:
                    i === currentIndex
                      ? colors.ink
                      : complete
                        ? colors.good
                        : e.skipped
                          ? `${colors.ink}15`
                          : `${colors.ink}30`,
                },
              ]}
            />
          );
        })}
      </View>

      {paused && (
        <View style={[styles.pausedBanner, { backgroundColor: `${colors.warn}20` }]}>
          <Text style={[styles.pausedText, { color: colors.ink }]}>
            Paused — timer stopped. Tap play to resume.
          </Text>
        </View>
      )}

      {/* Main Exercise Content */}
      <ScrollView
        style={styles.scrollArea}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.exCounter, { color: colors.muted }]}>
          Exercise {currentIndex + 1} of {active.length}
          {current.skipped ? ' · skipped' : ''}
        </Text>
        <Text style={[styles.exTitle, { color: colors.ink }]}>{ex.name}</Text>
        <Text style={[styles.exTarget, { color: colors.muted }]}>
          Target {current.sets.length} × {current.targetReps} · rest {current.restSec}s
        </Text>

        <View style={styles.setsList}>
          {current.sets.map((s, i) => (
            <SetRow
              key={i}
              index={i}
              set={s}
              bodyweight={s.weight === 0 && ex.equipment === 'Bodyweight'}
              onChange={(p) => store.updateSet(currentIndex, i, p)}
              onComplete={() => completeSet(i)}
            />
          ))}
        </View>

        <View style={styles.setActions}>
          <Button
            appearance="premium"
            variant="secondary"
            icon={Plus}
            title="Add set"
            style={{ flex: 1 }}
            onPress={() => store.addSet(currentIndex)}
          />
          <Button
            appearance="premium"
            variant="secondary"
            icon={SkipForward}
            title="Skip exercise"
            style={{ flex: 1 }}
            onPress={() => {
              store.skipExercise(currentIndex);
              if (next) store.setCurrentIndex(currentIndex + 1);
            }}
          />
        </View>

        <View style={styles.navRow}>
          <Button
            appearance="premium"
            variant="ghost"
            icon={ChevronLeft}
            title="Previous"
            disabled={currentIndex === 0}
            onPress={() => store.setCurrentIndex(currentIndex - 1)}
          />
          <Button
            appearance="premium"
            variant="ghost"
            title="Next"
            disabled={!next}
            onPress={() => store.setCurrentIndex(currentIndex + 1)}
          />
        </View>

        <View
          style={[
            styles.progressCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <Text style={[styles.progLabel, { color: colors.muted }]}>Session progress</Text>
          <Text style={[styles.progNumber, { color: colors.ink }]}>
            {doneSets}
            <Text style={[styles.progTotal, { color: colors.muted }]}> / {totalSets} sets</Text>
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Sticky Finish Button */}
      <View
        style={[
          styles.bottomFooter,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.line,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {restTimer.rest ? (
          <RestTimer
            remaining={restTimer.rest.remaining}
            total={restTimer.rest.total}
            nextLabel={
              current.sets.every((s) => s.done) && next
                ? getExerciseById(next.exerciseId).name
                : `Set ${current.sets.filter((s) => s.done).length + 1}`
            }
            onAdd={() => restTimer.add(15)}
            onSkip={restTimer.skip}
          />
        ) : null}

        <Button
          appearance="premium"
          size="lg"
          fullWidth
          variant="primary"
          title="Finish workout"
          onPress={() => setConfirmFinish(true)}
        />
      </View>

      <ConfirmDialog
        open={confirmFinish}
        title="Finish workout?"
        message={
          doneSets < totalSets
            ? `${totalSets - doneSets} sets aren’t marked done. They won’t count toward volume.`
            : 'Great session. Ready to see your summary?'
        }
        confirmLabel="Finish"
        cancelLabel="Keep going"
        onCancel={() => setConfirmFinish(false)}
        onConfirm={() => {
          setConfirmFinish(false);
          finish();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    minHeight: 64,
  },
  headerBtn: {
    width: 44,
    minHeight: premium.layout.touch,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerCol: {
    alignItems: 'center',
  },
  timerSub: {
    ...premium.type.caption,
  },
  timerDigits: {
    ...premium.type.metric,
    fontVariant: ['tabular-nums'],
  },
  pauseBtn: {
    width: 44,
    minHeight: premium.layout.touch,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  stripBar: {
    flex: 1,
    minHeight: 24,
    borderRadius: 2.5,
  },
  pausedBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  pausedText: {
    ...premium.type.caption,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  exCounter: {
    ...premium.type.caption,
  },
  exTitle: {
    ...premium.type.title,
    marginTop: 2,
  },
  exTarget: {
    ...premium.type.caption,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 16,
    paddingBottom: 6,
  },
  thText: {
    ...premium.type.caption,
  },
  thCols: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  setsList: {
    gap: 4,
  },
  setActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  progressCard: {
    borderRadius: premium.radius.card,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  progLabel: {
    ...premium.type.caption,
  },
  progNumber: {
    ...premium.type.metric,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  progTotal: {
    ...premium.type.body,
  },
  bottomFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
