import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { ChevronRight, Dumbbell, HeartPulse, Moon, Scale } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { useHasDeviceData, useHealthStore } from '../../health-integration/store/healthStore';
import { useWorkoutStore } from '../../workouts/store/workoutStore';
import { useWeightStore } from '../../weight-tracking/store/weightStore';
import { useHomeOverview } from '@/features/home/hooks/use-home-overview';
import { ActivityType, activityTypes } from '../constants/activity-types';
import { useQuery } from '@tanstack/react-query';
import { progressApi } from '@/features/progress/api/progress-api';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

export function ActivityScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const status = useHealthStore((s) => s.status);
  const plannedSession = useWorkoutStore((s) => s.plannedSession);
  const { dashboard, isRefreshing, refresh } = useHomeOverview();
  const userId = useAuthStore((s) => s.user?.id);
  const stepHistory = useQuery({
    queryKey: ['dashboard', 'steps-week', userId],
    queryFn: () =>
      progressApi.getAnalytics({
        metric: 'steps',
        range: 'W',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    enabled: !!userId,
  });
  const weeklyActivity = stepHistory.data?.points ?? [];
  const hourlySteps: { label: string; value: number }[] = [];
  const summary = dashboard.data?.summary;
  const lastWeight = summary?.weight ?? null;
  const [view, setView] = useState<'today' | 'week'>('today');

  const activeCalories = summary?.caloriesBurned ?? 0;
  const activeMinutes = summary?.activeMinutes ?? 0;
  const steps = summary?.steps ?? null;
  const hasSteps = steps !== null && steps > 0;

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const rings = [
    {
      label: 'Active calories',
      value: activeCalories,
      goal: null,
      color: colors.move,
      size: 168,
      unavailable: !summary,
    },
    {
      label: 'Active minutes',
      value: activeMinutes,
      goal: null,
      color: colors.accent,
      size: 134,
      unavailable: !summary,
    },
    {
      label: 'Steps',
      value: steps ?? 0,
      goal: stepHistory.data?.goal ?? null,
      color: colors.sky,
      size: 100,
      unavailable: steps === null,
    },
  ];

  return (
    <Screen
      largeTitle="Activity"
      subtitle={formattedDate}
      showBack={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing || stepHistory.isRefetching}
          onRefresh={() => {
            void refresh();
            void stepHistory.refetch();
          }}
          tintColor={colors.accentStrong}
        />
      }
    >
      <View style={styles.content}>
        {dashboard.isError || stepHistory.isError ? (
          <StatusBanner
            tone="error"
            title="Couldn’t refresh activity"
            body="Pull to try again. Previously loaded values may be out of date."
          />
        ) : null}
        {status === 'offline' && (
          <StatusBanner
            tone="offline"
            title="Offline"
            body="Showing the last available activity. Pull to refresh when connected."
          />
        )}

        <SegmentedControl
          label="Activity range"
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'This week' },
          ]}
          value={view}
          onChange={(val) => setView(val as 'today' | 'week')}
        />

        {view === 'today' ? (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <View style={styles.ringsRow}>
              {/* Concentric rings wrapper */}
              <View style={styles.ringsContainer}>
                {rings.map((r, i) => (
                  <View
                    key={r.label}
                    style={[
                      styles.ringAbsolute,
                      {
                        width: r.size,
                        height: r.size,
                        top: (168 - r.size) / 2,
                        left: (168 - r.size) / 2,
                      },
                    ]}
                  >
                    <ProgressRing
                      size={r.size}
                      strokeWidth={14}
                      value={r.goal ? r.value / r.goal : 0}
                      color={r.color}
                    />
                  </View>
                ))}
              </View>

              {/* Rings metrics column */}
              <View style={styles.ringLabelsCol}>
                {rings.map((r) => (
                  <View key={r.label} style={styles.ringLabelItem}>
                    <Text style={[styles.ringMetricLabel, { color: colors.muted }]}>{r.label}</Text>
                    <Text style={[styles.ringMetricValue, { color: colors.ink }]}>
                      {r.unavailable ? '—' : r.value.toLocaleString()}
                      {!r.unavailable && r.goal != null && (
                        <Text style={[styles.ringMetricGoal, { color: colors.muted }]}>
                          {' '}
                          /{r.goal.toLocaleString()}
                        </Text>
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Distance, Floors, Active cal */}
            <View style={[styles.statsGrid, { borderTopColor: colors.line }]}>
              {[
                ['Distance', '—'],
                ['Floors', '—'],
                ['Active cal', `${activeCalories}`],
              ].map(([l, v]) => (
                <View key={l} style={styles.statCol}>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{l}</Text>
                  <Text style={[styles.statVal, { color: colors.ink }]}>{v}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sourceTagRow}>
              <SourceTag
                source={
                  WEARABLES_ENABLED && hasDevice && hasSteps
                    ? { kind: 'synced', label: 'Wearable synced' }
                    : {
                        kind: 'estimated',
                        label: WEARABLES_ENABLED
                          ? 'Workout activity logged · No step tracker connected'
                          : 'Workout activity logged',
                      }
                }
              />
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Steps this week</Text>
            {weeklyActivity.length > 0 ? (
              <>
                <Text style={[styles.bigNumber, { color: colors.ink }]}>
                  {weeklyActivity.reduce((sum, point) => sum + point.value, 0).toLocaleString()}
                </Text>
                <View style={{ marginTop: 12 }}>
                  <BarChart
                    data={weeklyActivity}
                    goal={stepHistory.data?.goal}
                    barColor={colors.sky}
                    height={120}
                  />
                </View>
              </>
            ) : (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
                  No step history available yet.
                </Text>
              </View>
            )}
          </View>
        )}

        {view === 'today' && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Steps by hour</Text>
            {hourlySteps.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <BarChart data={hourlySteps} barColor={colors.sky} height={90} highlightIndex={1} />
              </View>
            ) : (
              <View style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                  {WEARABLES_ENABLED
                    ? 'Hourly breakdown requires a connected wearable or pedometer.'
                    : 'Hourly breakdown requires pedometer activity data.'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* By Activity Section */}
        <View style={styles.byTypeSection}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>By activity · this week</Text>
          <ListGroup>
            {(Object.keys(activityTypes) as ActivityType[]).map((k) => {
              const t = activityTypes[k];
              return (
                <ListRow
                  key={k}
                  icon={t.icon}
                  title={t.label}
                  subtitle={t.detail}
                  value={t.week}
                  onPress={() => navigate('activityDetail', { type: k })}
                />
              );
            })}
          </ListGroup>
        </View>

        {/* Workouts Navigation Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigate('workouts')}
          style={[
            styles.workoutNavCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <View style={[styles.workoutIconWrap, { backgroundColor: colors.accent }]}>
            <Dumbbell size={20} color={colors.accentInk} />
          </View>
          <View style={styles.workoutNavBody}>
            <Text style={[styles.workoutNavTitle, { color: colors.ink }]}>Workouts</Text>
            <Text style={[styles.workoutNavSubtitle, { color: colors.muted }]}>
              {plannedSession ? `Today: ${plannedSession.title}` : 'No session planned'} · plans,
              library, records
            </Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </TouchableOpacity>

        {/* Other Metrics List */}
        <ListGroup>
          <ListRow
            icon={HeartPulse}
            iconColor={colors.accent}
            title="Recovery"
            subtitle={
              summary?.recoveryScore != null
                ? `${summary.recoveryScore} · Synced`
                : WEARABLES_ENABLED
                ? 'Needs a wearable'
                : 'No data'
            }
            onPress={() => navigate('recovery')}
          />
          <ListRow
            icon={Moon}
            iconColor={colors.sleep}
            title="Sleep"
            subtitle={
              summary?.sleepScore != null && summary?.sleepDuration
                ? `${summary.sleepDuration} · Score ${summary.sleepScore}`
                : WEARABLES_ENABLED
                ? 'Needs a wearable'
                : 'No data'
            }
            onPress={() => navigate('sleep')}
          />
          <ListRow
            icon={Scale}
            title="Weight & body"
            subtitle={
              lastWeight != null ? `${lastWeight.toFixed(1)} kg · Logged` : 'Log your weight'
            }
            onPress={() => navigate('weight')}
          />
        </ListGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  ringsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  ringsContainer: {
    position: 'relative',
    width: 168,
    height: 168,
  },
  ringAbsolute: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabelsCol: {
    flex: 1,
    gap: 12,
  },
  ringLabelItem: {},
  ringMetricLabel: {
    fontSize: 12,
  },
  ringMetricValue: {
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  ringMetricGoal: {
    fontSize: 11,
    fontWeight: '400',
  },
  statsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 20,
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  sourceTagRow: {
    marginTop: 12,
  },
  sectionSubtitle: {
    fontSize: 13,
  },
  bigNumber: {
    fontSize: 28,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  byTypeSection: {},
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  workoutNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
  },
  workoutIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutNavBody: {
    flex: 1,
  },
  workoutNavTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  workoutNavSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
});
