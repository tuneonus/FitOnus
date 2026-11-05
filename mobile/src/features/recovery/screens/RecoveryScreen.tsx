import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Activity, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { SourceTag } from '@/shared/components/ui/SourceTag';
import { ProgressRing } from '@/shared/components/charts/ProgressRing';
import { LineChart } from '@/shared/components/charts/LineChart';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { recommendationLevels, recoveryInputs, recoveryTrend } from '../data/recoveryMock';
import { useTheme } from '@/hooks/use-theme';

export function RecoveryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const hasData = status === 'synced' || status === 'offline' || status === 'error';
  const score = 84;
  const active = score >= 70 ? 'hard' : score >= 40 ? 'moderate' : 'rest';

  if (!hasData) {
    return (
      <Screen title="Recovery">
        <EmptyState
          icon={Activity}
          title={
            status === 'permissions'
              ? 'Recovery needs HRV and sleep access'
              : 'Recovery needs a wearable'
          }
          body="The score combines overnight HRV, resting heart rate and sleep. Without them we show no score rather than a guess."
          actionLabel={status === 'permissions' ? 'Review permissions' : 'Connect a device'}
          onAction={() => navigate('healthIntegration')}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Recovery">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Recovery Score Hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface2 }]}>
          <View style={styles.heroContent}>
            <ProgressRing
              size={120}
              strokeWidth={11}
              value={score / 100}
              color={colors.accent}
              trackColor={colors.line}
            >
              <View style={styles.ringCenter}>
                <Text style={[styles.scoreNumber, { color: colors.ink }]}>{score}</Text>
                <Text style={[styles.scoreSub, { color: colors.muted }]}>of 100</Text>
              </View>
            </ProgressRing>

            <View style={styles.heroDetails}>
              <Text style={[styles.primeHeading, { color: colors.ink }]}>Primed to train</Text>
              <Text style={[styles.primeSub, { color: colors.muted }]}>Up 10 from yesterday</Text>
              <View style={{ marginTop: 8 }}>
                <SourceTag source={{ kind: 'estimated', label: 'FitOnus model · not clinical' }} />
              </View>
            </View>
          </View>
        </View>

        {/* Today's Recommendation */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>Today’s recommendation</Text>
          <View style={styles.recList}>
            {recommendationLevels.map((l) => {
              const isSelected = l.key === active;
              return (
                <View
                  key={l.key}
                  style={[
                    styles.recCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isSelected ? colors.ink : colors.line,
                      opacity: isSelected ? 1 : 0.6,
                    },
                  ]}
                >
                  <View style={styles.recHeader}>
                    <Text style={[styles.recTitle, { color: colors.ink }]}>{l.label}</Text>
                    <Text style={[styles.recRange, { color: colors.muted }]}>{l.range}</Text>
                  </View>
                  <Text style={[styles.recDetail, { color: colors.muted }]}>{l.detail}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* What's Driving It */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>What’s driving it</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {recoveryInputs.map((i, idx) => (
              <View
                key={i.key}
                style={[
                  styles.inputRow,
                  { borderBottomColor: colors.line },
                  idx === recoveryInputs.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.inputHeader}>
                  <Text style={[styles.inputLabel, { color: colors.ink }]}>{i.label}</Text>
                  <Text style={[styles.inputValue, { color: colors.ink }]}>{i.value}</Text>
                </View>

                {/* Impact Track */}
                <View style={[styles.impactTrack, { backgroundColor: colors.surface2 }]}>
                  <View style={[styles.impactCenterTick, { backgroundColor: colors.line }]} />
                  {i.impact !== 0 && (
                    <View
                      style={[
                        styles.impactBar,
                        {
                          backgroundColor: i.impact > 0 ? colors.good : colors.warn,
                          left: i.impact > 0 ? '50%' : `${50 + i.impact * 50}%`,
                          width: `${Math.abs(i.impact) * 50}%`,
                        },
                      ]}
                    />
                  )}
                </View>

                <Text style={[styles.inputNote, { color: colors.muted }]}>
                  {i.note} · {i.baseline}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <SourceTag source={i.source} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 14-day Trend */}
        <View style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.trendHeading, { color: colors.ink }]}>14-day trend</Text>
          <View style={{ marginTop: 8 }}>
            <LineChart
              points={recoveryTrend}
              target={70}
              targetLabel="Train-hard line"
              height={150}
              strokeColor={colors.accent}
            />
          </View>
        </View>

        {/* Coach Insight */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate('coach', { q: 'Why is my recovery lower this week?' })}
          style={[styles.coachCard, { backgroundColor: colors.surface2 }]}
        >
          <View style={{ marginTop: 2 }}>
            <Sparkles size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.coachHeading, { color: colors.ink }]}>
              Wednesday’s dip explained
            </Text>
            <Text style={[styles.coachBody, { color: colors.muted }]}>
              Late bedtime + heavy legs dropped you to 58. You bounced back in two nights — a sign your base fitness is improving.
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          Recovery is a training guide built from your wearable data. It is not a medical measurement.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 38,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  scoreSub: {
    fontSize: 11,
    marginTop: 2,
  },
  heroDetails: {
    flex: 1,
    gap: 2,
  },
  primeHeading: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  primeSub: {
    fontSize: 13,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  recList: {
    gap: 8,
  },
  recCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    gap: 4,
  },
  recHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  recTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  recRange: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  recDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inputRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  inputLabel: {
    fontSize: 14.5,
    fontWeight: '500',
  },
  inputValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  impactTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  impactCenterTick: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: '100%',
    marginLeft: -1,
  },
  impactBar: {
    position: 'absolute',
    height: '100%',
    borderRadius: 3,
  },
  inputNote: {
    fontSize: 12.5,
    marginTop: 8,
  },
  trendCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  trendHeading: {
    fontSize: 15,
    fontWeight: '600',
  },
  coachCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 18,
    borderRadius: 24,
  },
  coachHeading: {
    fontSize: 15,
    fontWeight: '600',
  },
  coachBody: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});

