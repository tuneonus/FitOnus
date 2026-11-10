import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
import { ActivityType, activityTypes, hourlySteps, weeklyActivity } from '../data/activityMock';
import { useTheme } from '@/hooks/use-theme';

export function ActivityScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const status = useHealthStore((s) => s.status);
  const plannedSession = useWorkoutStore((s) => s.plannedSession);
  const { dashboard } = useHomeOverview();
  const summary = dashboard.data?.summary;
  const weightEntries = useWeightStore((s) => s.entries);
  const lastWeight = weightEntries[0]?.value ?? summary?.weight ?? null;
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
    { label: 'Active calories', value: activeCalories, goal: 650, color: colors.move, size: 168, unavailable: false },
    { label: 'Active minutes', value: activeMinutes, goal: 45, color: colors.accent, size: 134, unavailable: false },
    { label: 'Steps', value: steps ?? 0, goal: 10000, color: colors.sky, size: 100, unavailable: steps === null },
  ];

  return (
    <Screen largeTitle="Activity" subtitle={formattedDate} showBack={false}>
      <View style={styles.content}>
        {status === 'offline' && (
          <StatusBanner
            tone="offline"
            title="Offline"
            body="Showing activity synced at 9:38 AM."
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
                      value={r.value / r.goal}
                      color={r.color}
                    />
                  </View>
                ))}
              </View>

              {/* Rings metrics column */}
              <View style={styles.ringLabelsCol}>
                {rings.map((r) => (
                  <View key={r.label} style={styles.ringLabelItem}>
                    <Text style={[styles.ringMetricLabel, { color: colors.muted }]}>
                      {r.label}
                    </Text>
                    <Text style={[styles.ringMetricValue, { color: colors.ink }]}>
                      {r.unavailable ? 'No tracker' : r.value.toLocaleString()}
                      {!r.unavailable && (
                        <Text style={[styles.ringMetricGoal, { color: colors.muted }]}>
                          {' '}/{r.goal.toLocaleString()}
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
                ['Distance', hasSteps ? `${((steps ?? 0) * 0.00075).toFixed(1)} km` : '—'],
                ['Floors', hasSteps ? '—' : '—'],
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
                  hasDevice && hasSteps
                    ? { kind: 'synced', label: 'Wearable synced' }
                    : { kind: 'estimated', label: 'Workout activity logged · No step tracker connected' }
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
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
              Steps this week
            </Text>
            {hasSteps ? (
              <>
                <Text style={[styles.bigNumber, { color: colors.ink }]}>{steps?.toLocaleString()}</Text>
                <View style={{ marginTop: 12 }}>
                  <BarChart
                    data={weeklyActivity}
                    goal={10000}
                    barColor={colors.sky}
                    height={120}
                  />
                </View>
              </>
            ) : (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center' }}>
                  No pedometer or wearable device connected.
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
            {hasSteps ? (
              <View style={{ marginTop: 12 }}>
                <BarChart
                  data={hourlySteps}
                  barColor={colors.sky}
                  height={90}
                  highlightIndex={1}
                />
              </View>
            ) : (
              <View style={{ paddingVertical: 14 }}>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                  Hourly breakdown requires a connected wearable or pedometer.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* By Activity Section */}
        <View style={styles.byTypeSection}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>
            By activity · this week
          </Text>
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
          <View
            style={[
              styles.workoutIconWrap,
              { backgroundColor: colors.accent },
            ]}
          >
            <Dumbbell size={20} color={colors.accentInk} />
          </View>
          <View style={styles.workoutNavBody}>
            <Text style={[styles.workoutNavTitle, { color: colors.ink }]}>
              Workouts
            </Text>
            <Text style={[styles.workoutNavSubtitle, { color: colors.muted }]}>
              {plannedSession ? `Today: ${plannedSession.title}` : 'No session planned'} · plans, library, records
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
                : 'Needs a wearable'
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
                : 'Needs a wearable'
            }
            onPress={() => navigate('sleep')}
          />
          <ListRow
            icon={Scale}
            title="Weight & body"
            subtitle={lastWeight != null ? `${lastWeight.toFixed(1)} kg · Logged` : 'Log your weight'}
            onPress={() => navigate('weight')}
          />
        </ListGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
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

