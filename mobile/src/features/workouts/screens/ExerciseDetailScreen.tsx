import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import { Dumbbell, Sparkles } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Badge } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { useWorkoutStore } from '../store/workoutStore';
import { WorkoutService } from '../services/workout-service';
import type { PersonalRecordView } from '../types/workout';
import { useTheme } from '@/hooks/use-theme';

export function ExerciseDetailScreen() {
  const { colors } = useTheme();
  const { id = 'e1' } = useRouteParams<{ id?: string }>();
  const { navigate } = useNavigation();
  const getExerciseById = useWorkoutStore((s) => s.getExerciseById);
  const ex = getExerciseById(id);
  const [prRecords, setPrRecords] = React.useState<PersonalRecordView[]>([]);

  React.useEffect(() => {
    WorkoutService.getPersonalRecords(ex.id).then(setPrRecords).catch(() => {});
  }, [ex.id]);

  const bestPr = prRecords[0];

  return (
    <Screen title={ex.name}>
      {ex.image ? (
        <Image source={{ uri: ex.image }} style={styles.heroImage} />
      ) : (
        <View
          style={[
            styles.placeholderHero,
            { backgroundColor: colors.surface2 },
          ]}
        >
          <Dumbbell size={40} color={colors.muted} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.ink }]}>{ex.name}</Text>

        <View style={styles.badgesRow}>
          <Badge tone="accent">{ex.muscle}</Badge>
          <Badge>{ex.equipment}</Badge>
          <Badge>{ex.level}</Badge>
          {ex.secondary?.map((s) => (
            <Badge key={s}>{s}</Badge>
          ))}
        </View>

        {bestPr && (
          <View
            style={[
              styles.prCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <View style={styles.prHeader}>
              <Text style={[styles.prTitle, { color: colors.ink }]}>
                Your top set
              </Text>
              <Text style={[styles.prMeta, { color: colors.muted }]}>
                PR {bestPr.weightKg ?? bestPr.value} kg {bestPr.reps ? `× ${bestPr.reps}` : ''} · {new Date(bestPr.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View style={{ marginTop: 8 }}>
              <LineChart
                points={prRecords.map((v, i) => ({
                  label: `S${i + 1}`,
                  value: v.weightKg ?? v.value,
                }))}
                ariaLabel={`${ex.name} top set trend`}
                height={120}
                formatValue={(v) => `${v} kg`}
                strokeColor={colors.accent}
              />
            </View>
          </View>
        )}

        {/* How to section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>How to</Text>
          <View style={styles.instructionsList}>
            {ex.instructions?.map((step, i) => (
              <View key={step} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepNumberBadge,
                    { backgroundColor: colors.surface2 },
                  ]}
                >
                  <Text style={[styles.stepNum, { color: colors.ink }]}>
                    {i + 1}
                  </Text>
                </View>
                <Text style={[styles.stepText, { color: colors.ink }]}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Coaching Cues */}
        {ex.cues && ex.cues.length > 0 && (
          <View style={[styles.cuesCard, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.cuesTitle, { color: colors.ink }]}>
              Coaching cues
            </Text>
            <View style={styles.cuesList}>
              {ex.cues.map((c) => (
                <Text key={c} style={[styles.cueItem, { color: colors.muted }]}>
                  — {c}
                </Text>
              ))}
            </View>
          </View>
        )}

        <Button
          variant="outline"
          fullWidth
          icon={Sparkles}
          title="Ask coach about this exercise"
          onPress={() =>
            navigate('coach', { q: `How should I progress ${ex.name}?` })
          }
          style={{ marginTop: 24 }}
        />

        <Text style={[styles.footerNote, { color: colors.muted }]}>
          AI form analysis from video is planned for a future release.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroImage: {
    width: '100%',
    height: 240,
    resizeMode: 'cover',
  },
  placeholderHero: {
    marginHorizontal: 16,
    height: 180,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  prCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginTop: 24,
  },
  prHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  prTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  prMeta: {
    fontSize: 12,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  instructionsList: {
    marginTop: 12,
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  cuesCard: {
    borderRadius: 20,
    padding: 16,
    marginTop: 24,
    gap: 8,
  },
  cuesTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  cuesList: {
    gap: 6,
  },
  cueItem: {
    fontSize: 14,
    lineHeight: 20,
  },
  footerNote: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
  },
});

