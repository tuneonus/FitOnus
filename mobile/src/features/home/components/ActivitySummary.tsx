import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { activityMeta, activityRings, weeklySteps } from '../data/homeMock';
import { useTheme } from '@/hooks/use-theme';

const ringSizes = [120, 94, 68];

export function ActivitySummary() {
  const { colors } = useTheme();
  const { switchTab, navigate } = useNavigation();
  const hasDevice = useHasDeviceData();

  if (!hasDevice) {
    return (
      <View style={styles.container}>
        <SectionHeader
          title="Activity"
          actionLabel="Connect"
          onAction={() => navigate('healthIntegration')}
        />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.line, padding: 20 },
          ]}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 4 }}>
            Activity tracking paused
          </Text>
          <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 18 }}>
            Daily steps, active calories, and movement rings require a connected smartwatch or Apple Health / Health Connect.
          </Text>
        </View>
      </View>
    );
  }

  const maxSteps = Math.max(
    ...weeklySteps.map((d) => d.steps),
    activityMeta.stepGoal
  );
  const avgPercent = (activityMeta.weeklyAverage / maxSteps) * 100;

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Activity"
        actionLabel="Details"
        onAction={() => switchTab('activity')}
      />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <View style={styles.topRow}>
          {/* Concentric rings */}
          <View style={styles.ringsContainer}>
            {activityRings.map((ring, idx) => {
              const sz = ringSizes[idx] || 60;
              return (
                <View
                  key={ring.key}
                  style={[
                    styles.ringWrapper,
                    {
                      width: sz,
                      height: sz,
                      marginLeft: -sz / 2,
                      marginTop: -sz / 2,
                    },
                  ]}
                >
                  <ProgressRing
                    size={sz}
                    stroke={10}
                    value={ring.value / ring.goal}
                    color={ring.color}
                  />
                </View>
              );
            })}
          </View>

          {/* Ring legend */}
          <View style={styles.legendColumn}>
            {activityRings.map((ring) => (
              <View key={ring.key} style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: ring.color }]}
                />
                <View>
                  <Text style={[styles.legendLabel, { color: colors.muted }]}>
                    {ring.label}
                  </Text>
                  <Text style={[styles.legendVal, { color: colors.ink }]}>
                    {ring.value.toLocaleString()}
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {' '}/ {ring.goal.toLocaleString()} {ring.unit}
                    </Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Weekly Step Bar Chart */}
        <View
          style={[
            styles.chartSection,
            { borderTopColor: colors.line },
          ]}
        >
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: colors.ink }]}>
              Steps this week
            </Text>
            <Text style={[styles.chartAvg, { color: colors.muted }]}>
              Avg {activityMeta.weeklyAverage.toLocaleString()}
            </Text>
          </View>

          {weeklySteps.length === 0 ? (
            <View style={{ height: 64, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                No wearable steps synced yet.
              </Text>
            </View>
          ) : (
            <View style={styles.barsContainer}>
              {weeklySteps.map((d, index) => {
                const isToday = index === weeklySteps.length - 1;
                const hitGoal = d.steps >= activityMeta.stepGoal;
                const barHeight = Math.max(6, (d.steps / maxSteps) * 64);
                const barColor = isToday
                  ? colors.sky
                  : hitGoal
                  ? 'rgba(14, 150, 220, 0.45)'
                  : 'rgba(128, 128, 128, 0.18)';

                return (
                  <View key={index} style={styles.barColumn}>
                    <View
                      style={[
                        styles.bar,
                        { height: barHeight, backgroundColor: barColor },
                      ]}
                    />
                    <Text style={[styles.dayText, { color: colors.muted }]}>
                      {d.day}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.bottomMeta}>
            <Text style={[styles.paceText, { color: colors.muted }]}>
              {activityMeta.pace}
            </Text>
            <SourceTag
              source={{
                kind: hasDevice ? 'synced' : 'manual',
                label: hasDevice ? 'Apple Watch' : 'Manual',
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginTop: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringsContainer: {
    width: 120,
    height: 120,
    position: 'relative',
  },
  ringWrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
  legendColumn: {
    flex: 1,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  legendLabel: {
    fontSize: 11.5,
  },
  legendVal: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  chartSection: {
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  chartAvg: {
    fontSize: 12,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 84,
    gap: 6,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  dayText: {
    fontSize: 10.5,
    marginTop: 4,
  },
  bottomMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  paceText: {
    fontSize: 11.5,
  },
});

