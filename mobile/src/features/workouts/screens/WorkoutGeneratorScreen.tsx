import { useDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { premium } from '@/shared/theme/premium';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { RefreshCw, Sparkles } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { FeatureScreen as Screen } from '@/shared/components/ui/FeatureScreen';
import { Button } from '../../../shared/components/ui/Button';
import { Chip } from '../../../shared/components/ui/Chip';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { showToast } from '../../../shared/stores/toastStore';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useProfileSetupStore } from '../../onboarding/store/profileSetupStore';
import { WorkoutBlock } from '../../ai-coach/components/blocks/WorkoutBlock';
import { generateWorkoutPlan } from '../services/workoutPlanGenerator';
import { useWorkoutStore } from '../store/workoutStore';
import type { WorkoutSession } from '../types/workout';
import { useTheme } from '@/hooks/use-theme';

const goals = ['Fat Loss', 'Muscle Gain', 'Strength', 'Full Body'];
const durations = [30, 45, 60, 75];
const levels = ['Beginner', 'Intermediate', 'Advanced'];
const allEquipment = [
  'Barbell',
  'Dumbbells',
  'Kettlebells',
  'Cable machine',
  'Bench',
  'Pull-up bar',
  'None',
];

export function WorkoutGeneratorScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const profile = useProfileSetupStore();
  const setPlanned = useWorkoutStore((s) => s.setPlannedSession);
  const catalog = useWorkoutStore((state) => state.catalog);
  const [goal, setGoal] = useState('Fat Loss');
  const [duration, setDuration] = useState(45);
  const [level, setLevel] = useState('Intermediate');
  const [equipment, setEquipment] = useState<string[]>(profile.equipment || ['Dumbbells', 'Bench']);
  const [phase, setPhase] = useState<'form' | 'generating' | 'result' | 'error'>('form');
  const [result, setResult] = useState<WorkoutSession | null>(null);
  const [rationale, setRationale] = useState<string[]>([]);
  const { data: dashboard } = useDashboard();
  const recovery = dashboard?.summary.recoveryScore;
  const hasRecovery = recovery != null;

  const generate = async () => {
    setPhase('generating');
    if (status === 'offline') {
      setPhase('error');
      return;
    }
    try {
      const generated = await generateWorkoutPlan({
        goal,
        durationMin: duration,
        equipment,
        level,
        hasRecovery,
      });
      setResult(generated.session);
      setRationale([
        `Goal: ${goal} · Experience: ${level}.`,
        `Duration preference: ${duration} minutes.`,
        `Equipment preference: ${equipment.join(', ')}. Review each movement and adjust your plan before training.`,
      ]);
      setPhase('result');
    } catch {
      setPhase('error');
    }
  };

  const save = () => {
    if (!result) return;
    setPlanned(result);
    showToast({ message: 'Saved as today’s workout' });
    navigate('workoutPlan');
  };

  if (phase === 'generating') {
    return (
      <Screen title="Building your plan">
        <View style={styles.generatingBody}>
          <Sparkles size={28} color={colors.accent} />
          <Text style={[styles.genHeading, { color: colors.ink }]}>
            Building your {duration}-minute {goal.toLowerCase()} session
          </Text>
          <View style={{ marginTop: 24 }}>
            <ActivityIndicator
              size="large"
              color={colors.accentStrong}
              accessibilityLabel="Generating workout"
            />
            <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, marginTop: 16 }}>
              Creating exercises for your selected preferences…
            </Text>
          </View>
        </View>
      </Screen>
    );
  }

  if (phase === 'result' && result) {
    return (
      <Screen
        title="Your new plan"
        footer={
          <View style={styles.resultFooter}>
            <Button
              appearance="premium"
              variant="secondary"
              size="lg"
              icon={RefreshCw}
              title="Regenerate"
              onPress={generate}
            />
            <Button
              appearance="premium"
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
                name:
                  catalog.find(
                    (exercise) => exercise.id === e.exerciseId || exercise.slug === e.exerciseId,
                  )?.name ?? 'Exercise',
                detail: `${e.sets} × ${e.reps}${e.weight ? ` · ${e.weight} kg` : ''}`,
              })),
            }}
          />

          <View style={[styles.whyCard, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.whyTitle, { color: colors.ink }]}>Why this plan</Text>
            {rationale.map((bullet, idx) => (
              <Text key={idx} style={[styles.whyBullet, { color: colors.muted }]}>
                • {bullet}
              </Text>
            ))}
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
          appearance="premium"
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
            body="Review your choices and connection, then try creating your plan again."
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
                appearance="premium"
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
                appearance="premium"
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
                appearance="premium"
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
          <Text style={[styles.legend, { color: colors.ink }]}>Equipment available</Text>
          <View style={styles.chipsWrap}>
            {allEquipment.map((e) => (
              <Chip
                appearance="premium"
                key={e}
                selected={equipment.includes(e)}
                label={e}
                onPress={() =>
                  setEquipment((prev) =>
                    e === 'None'
                      ? prev.includes('None')
                        ? []
                        : ['None']
                      : prev.includes(e)
                        ? prev.filter((x) => x !== e)
                        : [...prev.filter((x) => x !== 'None'), e],
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
          <Text style={[styles.recTitle, { color: colors.ink }]}>Recovery input</Text>
          {hasRecovery ? (
            <>
              <Text style={[styles.recText, { color: colors.muted }]}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>{recovery}</Text> / 100 ·
                Your latest recovery score
              </Text>
              <View style={{ marginTop: 6 }}>
                <SourceTag
                  source={{
                    kind: 'estimated',
                    label: 'Recovery from your dashboard',
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
    ...premium.type.title,
    marginTop: 16,
  },
  resultFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultContent: {
    paddingHorizontal: 0,
    gap: 16,
    paddingBottom: 32,
  },
  whyCard: {
    borderRadius: premium.radius.card,
    padding: 16,
    gap: 6,
  },
  whyTitle: {
    ...premium.type.body,
  },
  whyBullet: {
    ...premium.type.body,
  },
  formBody: {
    paddingHorizontal: 0,
    gap: 24,
    paddingBottom: 32,
  },
  fieldset: {
    gap: 10,
  },
  legend: {
    ...premium.type.body,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  errorHint: {
    ...premium.type.caption,
  },
  recoveryCard: {
    borderRadius: premium.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  recTitle: {
    ...premium.type.body,
  },
  recText: {
    ...premium.type.body,
    marginTop: 4,
  },
});
