import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { RefreshCw, Sparkles } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { Chip } from '../../../shared/components/ui/Chip';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { showToast } from '../../../shared/stores/toastStore';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { ThinkingIndicator } from '../../ai-coach/components/ThinkingIndicator';
import { WorkoutBlock } from '../../ai-coach/components/blocks/WorkoutBlock';
import { mockAiTools } from '../../ai-coach/services/mockAiTools';
import { exerciseById } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';
import type { WorkoutSession } from '../types/workout';
import { useTheme } from '@/hooks/use-theme';

const goals = ['Fat Loss', 'Muscle Gain', 'Strength', 'Full Body'];
const durations = [30, 45, 60, 75];
const levels = ['Beginner', 'Intermediate', 'Advanced'];
const allEquipment = ['Barbell', 'Dumbbells', 'Kettlebells', 'Cable machine', 'Bench', 'Pull-up bar', 'None'];

export function WorkoutGeneratorScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const profile = useProfileSetupStore();
  const setPlanned = useWorkoutStore((s) => s.setPlannedSession);
  const [goal, setGoal] = useState('Fat Loss');
  const [duration, setDuration] = useState(45);
  const [level, setLevel] = useState('Intermediate');
  const [equipment, setEquipment] = useState<string[]>(profile.equipment || ['Dumbbells', 'Bench']);
  const [phase, setPhase] = useState<'form' | 'generating' | 'result' | 'error'>('form');
  const [result, setResult] = useState<WorkoutSession | null>(null);
  const hasRecovery = status === 'synced';

  const generate = async () => {
    setPhase('generating');
    if (status === 'offline') {
      setTimeout(() => setPhase('error'), 1600);
      return;
    }
    const session = await mockAiTools.createWorkoutPlan({
      goal,
      durationMin: duration,
      equipment,
      recovery: hasRecovery ? 84 : undefined,
    });
    setResult({
      ...session,
      durationMin: duration,
      title: goal === 'Fat Loss' ? session.title : `${goal} Session`,
    });
    setPhase('result');
  };

  const save = () => {
    if (!result) return;
    setPlanned(result);
    showToast({ message: 'Saved as today’s workout' });
    navigate('workoutPlan');
  };

  if (phase === 'generating') {
    return (
      <Screen title="AI plan">
        <View style={styles.generatingBody}>
          <Sparkles size={28} color={colors.accent} />
          <Text style={[styles.genHeading, { color: colors.ink }]}>
            Building your {duration}-minute {goal.toLowerCase()} session
          </Text>
          <View style={{ marginTop: 24 }}>
            <ThinkingIndicator
              toolCalls={[
                'getGoals',
                'getRecoveryScore',
                'getWorkoutHistory',
                'createWorkoutPlan',
              ]}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (phase === 'result' && result) {
    return (
      <Screen
        title="Your AI plan"
        footer={
          <View style={styles.resultFooter}>
            <Button
              variant="secondary"
              size="lg"
              icon={RefreshCw}
              title="Regenerate"
              onPress={generate}
            />
            <Button
              size="lg"
              title="Use today"
              style={{ flex: 1 }}
              onPress={save}
            />
          </View>
        }
      >
        <View style={styles.resultContent}>
          <WorkoutBlock
            block={{
              type: 'workout',
              title: result.title,
              focus: `${goal} · ${level}`,
              durationMin: duration,
              exercises: result.exercises.map((e) => ({
                name: exerciseById(e.exerciseId).name,
                detail: `${e.sets} × ${e.reps}${e.weight ? ` · ${e.weight} kg` : ''}`,
              })),
            }}
          />

          <View style={[styles.whyCard, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.whyTitle, { color: colors.ink }]}>
              Why this plan
            </Text>
            <Text style={[styles.whyBullet, { color: colors.muted }]}>
              • {hasRecovery
                ? 'Recovery 84 supports a moderate–high effort circuit.'
                : 'No recovery data — kept intensity moderate.'}
            </Text>
            <Text style={[styles.whyBullet, { color: colors.muted }]}>
              • Short 30–45 s rests keep heart rate elevated for fat loss.
            </Text>
            <Text style={[styles.whyBullet, { color: colors.muted }]}>
              • No overhead pressing, based on your shoulder note in memory.
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Generate plan"
      footer={
        <Button
          size="lg"
          fullWidth
          icon={Sparkles}
          title="Generate workout"
          disabled={equipment.length === 0}
          onPress={generate}
        />
      }
    >
      <View style={styles.formBody}>
        {phase === 'error' && (
          <StatusBanner
            tone="error"
            title="Couldn’t generate a plan"
            body="The AI service didn’t respond. Check your connection and try again."
            actionLabel="Retry"
            onAction={generate}
          />
        )}

        {/* Goal */}
        <View style={styles.fieldset}>
          <Text style={[styles.legend, { color: colors.ink }]}>Goal</Text>
          <View style={styles.chipsWrap}>
            {goals.map((g) => (
              <Chip
                key={g}
                selected={goal === g}
                label={g}
                onPress={() => setGoal(g)}
              />
            ))}
          </View>
        </View>

        {/* Experience */}
        <View style={styles.fieldset}>
          <Text style={[styles.legend, { color: colors.ink }]}>Experience</Text>
          <View style={styles.chipsWrap}>
            {levels.map((l) => (
              <Chip
                key={l}
                selected={level === l}
                label={l}
                onPress={() => setLevel(l)}
              />
            ))}
          </View>
        </View>

        {/* Duration */}
        <View style={styles.fieldset}>
          <Text style={[styles.legend, { color: colors.ink }]}>Duration</Text>
          <View style={styles.chipsWrap}>
            {durations.map((d) => (
              <Chip
                key={d}
                selected={duration === d}
                label={`${d} min`}
                onPress={() => setDuration(d)}
              />
            ))}
          </View>
        </View>

        {/* Equipment */}
        <View style={styles.fieldset}>
          <Text style={[styles.legend, { color: colors.ink }]}>
            Equipment available
          </Text>
          <View style={styles.chipsWrap}>
            {allEquipment.map((e) => (
              <Chip
                key={e}
                selected={equipment.includes(e)}
                label={e}
                onPress={() =>
                  setEquipment((prev) =>
                    prev.includes(e)
                      ? prev.filter((x) => x !== e)
                      : [...prev, e]
                  )
                }
              />
            ))}
          </View>
          {equipment.length === 0 && (
            <Text style={[styles.errorHint, { color: colors.bad }]}>
              Pick at least one, or “None” for bodyweight.
            </Text>
          )}
        </View>

        {/* Recovery Card */}
        <View
          style={[
            styles.recoveryCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <Text style={[styles.recTitle, { color: colors.ink }]}>
            Recovery input
          </Text>
          {hasRecovery ? (
            <>
              <Text style={[styles.recText, { color: colors.muted }]}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>84</Text> ·
                Train hard
              </Text>
              <View style={{ marginTop: 6 }}>
                <SourceTag
                  source={{
                    kind: 'estimated',
                    label: 'FitOnus model from Apple Watch data',
                  }}
                />
              </View>
            </>
          ) : (
            <Text style={[styles.recText, { color: colors.muted }]}>
              Not available — the plan will use moderate intensity.
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  generatingBody: {
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  genHeading: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 16,
    letterSpacing: -0.3,
  },
  resultFooter: {
    flexDirection: 'row',
    gap: 8,
  },
  resultContent: {
    paddingHorizontal: 16,
    gap: 16,
    paddingBottom: 32,
  },
  whyCard: {
    borderRadius: 20,
    padding: 16,
    gap: 6,
  },
  whyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  whyBullet: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  formBody: {
    paddingHorizontal: 20,
    gap: 24,
    paddingBottom: 32,
  },
  fieldset: {
    gap: 10,
  },
  legend: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  errorHint: {
    fontSize: 12.5,
  },
  recoveryCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  recTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  recText: {
    fontSize: 13.5,
    marginTop: 4,
  },
});

