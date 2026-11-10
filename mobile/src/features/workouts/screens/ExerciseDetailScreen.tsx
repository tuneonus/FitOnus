import { useQuery } from '@tanstack/react-query';
import { workoutApi } from '../api/workout-api';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { premium } from '@/shared/theme/premium';
import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView } from 'react-native';
import { Dumbbell, Sparkles } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { FeatureScreen as Screen } from '@/shared/components/ui/FeatureScreen';
import { Badge } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { LineChart } from '../../../shared/components/charts/LineChart';
import { useWorkoutStore } from '../store/workoutStore';
import { WorkoutService } from '../services/workout-service';
import type { PersonalRecordView } from '../types/workout';
import { useTheme } from '@/hooks/use-theme';

export function ExerciseDetailScreen() {
  const { colors } = useTheme();
  const { id } = useRouteParams<{ id?: string }>();
  const { navigate } = useNavigation();
  const catalog = useWorkoutStore((state) => state.catalog);
  const cached = catalog.find((exercise) => exercise.id === id || exercise.slug === id);
  const details = useQuery({
    queryKey: ['exercises', 'detail', id],
    queryFn: () => workoutApi.getExerciseById(id!),
    enabled: Boolean(id && /^[0-9a-f-]{36}$/i.test(id)),
    retry: 1,
  });
  const ex = details.data ?? cached;
  const [prRecords, setPrRecords] = React.useState<PersonalRecordView[]>([]);

  const exerciseId = ex?.id;
  React.useEffect(() => {
    if (!exerciseId) return;
    WorkoutService.getPersonalRecords(exerciseId)
      .then(setPrRecords)
      .catch(() => {});
  }, [exerciseId]);

  const bestPr = prRecords[0];
  if (!ex)
    return (
      <Screen title="Exercise details">
        {details.isLoading ? (
          <Skeleton height={160} />
        ) : (
          <EmptyState
            appearance="premium"
            icon={Dumbbell}
            title="Exercise unavailable"
            body="Try loading this exercise again, or return to the library."
            actionLabel="Retry"
            onAction={() => {
              void details.refetch();
            }}
          />
        )}
      </Screen>
    );

  return (
    <Screen title={ex.name}>
      {details.isError ? (
        <StatusBanner
          tone="warning"
          title="Showing saved exercise details"
          actionLabel="Retry"
          onAction={() => {
            void details.refetch();
          }}
        />
      ) : null}
      {ex.image ? (
        <Image source={{ uri: ex.image }} style={styles.heroImage} />
      ) : (
        <View style={[styles.placeholderHero, { backgroundColor: colors.surface2 }]}>
          <Dumbbell size={40} color={colors.muted} />
        </View>
      )}

      <View style={styles.body}>
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
              <Text style={[styles.prTitle, { color: colors.ink }]}>Your top set</Text>
              <Text style={[styles.prMeta, { color: colors.muted }]}>
                PR {bestPr.weightKg ?? bestPr.value} kg {bestPr.reps ? `× ${bestPr.reps}` : ''} ·{' '}
                {new Date(bestPr.achievedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
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
                strokeColor={colors.accentStrong}
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
                <View style={[styles.stepNumberBadge, { backgroundColor: colors.surface2 }]}>
                  <Text style={[styles.stepNum, { color: colors.ink }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.ink }]}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Coaching Cues */}
        {ex.cues && ex.cues.length > 0 && (
          <View style={[styles.cuesCard, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.cuesTitle, { color: colors.ink }]}>Coaching cues</Text>
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
          appearance="premium"
          variant="outline"
          fullWidth
          icon={Sparkles}
          title="Ask coach about this exercise"
          onPress={() => navigate('coach', { q: `How should I progress ${ex.name}?` })}
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
    marginHorizontal: 0,
    height: 100,
    borderRadius: premium.radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    ...premium.type.title,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  prCard: {
    borderRadius: premium.radius.card,
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
    ...premium.type.body,
  },
  prMeta: {
    ...premium.type.caption,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    ...premium.type.label,
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
    ...premium.type.caption,
    fontVariant: ['tabular-nums'],
  },
  stepText: {
    ...premium.type.body,
    flex: 1,
  },
  cuesCard: {
    borderRadius: premium.radius.card,
    padding: 16,
    marginTop: 24,
    gap: 8,
  },
  cuesTitle: {
    ...premium.type.body,
  },
  cuesList: {
    gap: 6,
  },
  cueItem: {
    ...premium.type.body,
  },
  footerNote: {
    ...premium.type.caption,
    marginTop: 12,
    textAlign: 'center',
  },
});
