import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trophy } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { showToast } from '../../../shared/stores/toastStore';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../store/workoutStore';
import type { WorkoutLog } from '../types/workout';
import { useTheme } from '@/hooks/use-theme';

const feelings = ['Easy', 'Solid', 'Hard', 'Max effort'];

export function WorkoutCompleteScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { reset } = useNavigation();
  const { lastCompleted: finished, saveCompleted } = useWorkoutStore();
  const hasDevice = useHasDeviceData();
  const [feel, setFeel] = useState('Solid');
  const [discard, setDiscard] = useState(false);

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
        <Text style={[styles.eyebrow, { color: colors.accent, marginBottom: 8 }]}>
          No active session
        </Text>
        <Text style={[styles.heading, { color: colors.heroInk, textAlign: 'center', marginBottom: 24 }]}>
          No recently completed workout found
        </Text>
        <Button title="Go to Workouts" onPress={() => reset('workouts')} />
      </View>
    );
  }

  const lastCompleted = finished;

  const stats = [
    { label: 'Duration', value: `${lastCompleted.durationMin}`, unit: 'min' },
    { label: 'Volume', value: lastCompleted.volumeKg.toLocaleString(), unit: 'kg' },
    { label: 'Sets', value: `${lastCompleted.sets}`, unit: '' },
    { label: 'Calories', value: `${lastCompleted.calories}`, unit: 'kcal' },
  ];

  const save = () => {
    saveCompleted();
    reset('home');
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
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          Workout complete
        </Text>
        <Text style={[styles.heading, { color: colors.heroInk }]}>
          {lastCompleted.title}
        </Text>

        {/* Stats Grid */}
        <View
          style={[
            styles.statsGrid,
            { backgroundColor: `${colors.heroInk}15` },
          ]}
        >
          {stats.map((s) => (
            <View
              key={s.label}
              style={[
                styles.statBox,
                { backgroundColor: colors.hero },
              ]}
            >
              <Text style={[styles.statLabel, { color: colors.heroMuted }]}>
                {s.label}
              </Text>
              <Text style={[styles.statNumber, { color: colors.heroInk }]}>
                {s.value}
                <Text style={[styles.statUnit, { color: colors.heroMuted }]}>
                  {' '}
                  {s.unit}
                </Text>
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 10 }}>
          <SourceTag
            source={
              hasDevice
                ? { kind: 'synced', label: 'Calories & HR from Apple Watch' }
                : {
                    kind: 'estimated',
                    label: 'Calories estimated from volume & body weight',
                  }
            }
          />
        </View>

        {/* PR or Volume notice */}
        {lastCompleted.prs > 0 ? (
          <View
            style={[
              styles.prNotice,
              { backgroundColor: `${colors.accent}20` },
            ]}
          >
            <Trophy size={22} color={colors.accent} />
            <Text style={[styles.prText, { color: colors.heroInk }]}>
              <Text style={{ fontWeight: '700' }}>New PR:</Text> Bench press 75 kg
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.noPrNotice,
              { backgroundColor: `${colors.heroInk}10` },
            ]}
          >
            <Text style={[styles.noPrText, { color: colors.heroMuted }]}>
              No new records today — volume was within 4% of Monday. Consistency like this is what drives PRs.
            </Text>
          </View>
        )}

        {/* Exercises summary */}
        <Text style={[styles.exercisesTitle, { color: colors.heroInk }]}>
          Exercises
        </Text>
        <View style={styles.exercisesList}>
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
              <Text
                style={[styles.exRowName, { color: colors.heroInk }]}
                numberOfLines={1}
              >
                {e.name}
              </Text>
              <Text style={[styles.exRowBest, { color: colors.heroMuted }]}>
                {e.best}
              </Text>
            </View>
          ))}
        </View>

        {/* How did it feel? */}
        <View style={styles.feelSection}>
          <Text style={[styles.feelTitle, { color: colors.heroInk }]}>
            How did it feel?
          </Text>
          <View style={styles.feelGrid}>
            {feelings.map((f) => {
              const isSelected = feel === f;
              return (
                <TouchableOpacity
                  key={f}
                  activeOpacity={0.7}
                  onPress={() => setFeel(f)}
                  style={[
                    styles.feelBtn,
                    {
                      backgroundColor: isSelected
                        ? colors.accent
                        : `${colors.heroInk}10`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.feelText,
                      {
                        color: isSelected ? colors.accentInk : colors.heroInk,
                        fontWeight: isSelected ? '600' : '400',
                      },
                    ]}
                  >
                    {f}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Save & Discard buttons */}
      <View style={styles.bottomBar}>
        <Button size="lg" fullWidth title="Save workout" onPress={save} />
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setDiscard(true)}
          style={styles.discardBtn}
        >
          <Text style={[styles.discardText, { color: colors.heroMuted }]}>
            Discard
          </Text>
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
    fontSize: 14,
    fontWeight: '600',
  },
  heading: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 20,
    gap: 1,
  },
  statBox: {
    width: '49.8%',
    padding: 16,
  },
  statLabel: {
    fontSize: 12,
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginTop: 4,
  },
  statUnit: {
    fontSize: 13,
    fontWeight: '400',
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
    fontSize: 14,
    flex: 1,
  },
  noPrNotice: {
    borderRadius: 18,
    padding: 16,
    marginTop: 20,
  },
  noPrText: {
    fontSize: 14,
    lineHeight: 20,
  },
  exercisesTitle: {
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 14,
    flex: 1,
  },
  exRowBest: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  feelSection: {
    marginTop: 24,
  },
  feelTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  feelGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  feelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feelText: {
    fontSize: 13,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  discardBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

