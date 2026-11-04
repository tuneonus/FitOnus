import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles, ChevronRight, Mic } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { briefDrivers, dailyBrief, suggestedQuestions } from '../data/homeMock';
import { useTheme } from '@/hooks/use-theme';

export function DailyBrief() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const hasData = status === 'synced' || status === 'offline' || status === 'error';
  const needsPermission = status === 'permissions';

  const askCoach = (q?: string) => {
    navigate('coach', q ? { q } : undefined);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.heroCard, { backgroundColor: colors.hero }]}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.titleRow}>
            <Sparkles size={14} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.heroMuted }]}>
              Daily brief
            </Text>
          </View>
          {hasData && (
            <Text style={[styles.updatedText, { color: colors.heroMuted }]}>
              Updated {dailyBrief.updatedAt}
            </Text>
          )}
        </View>

        {/* Recovery Dial & Headline */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => (hasData ? navigate('recovery') : navigate('healthIntegration'))}
          style={styles.recoveryRow}
        >
          <ProgressRing
            size={104}
            stroke={9}
            value={hasData ? dailyBrief.recovery / 100 : 0}
            color={colors.accent}
            trackColor="rgba(244, 244, 238, 0.1)"
          >
            <Text style={[styles.recoveryVal, { color: colors.heroInk }]}>
              {hasData ? dailyBrief.recovery : '—'}
            </Text>
            <Text style={[styles.recoveryLabel, { color: colors.heroMuted }]}>
              Recovery
            </Text>
          </ProgressRing>

          <View style={styles.headlineColumn}>
            <Text style={[styles.headlineText, { color: colors.heroInk }]}>
              {hasData
                ? dailyBrief.headline
                : needsPermission
                ? 'Sleep & HRV access is off'
                : 'Recovery needs more data'}
            </Text>

            {hasData ? (
              <View
                style={[
                  styles.recPill,
                  { backgroundColor: 'rgba(200, 245, 60, 0.15)' },
                ]}
              >
                <View
                  style={[styles.recDot, { backgroundColor: colors.accent }]}
                />
                <Text style={[styles.recText, { color: colors.accent }]}>
                  {dailyBrief.recommendation}
                </Text>
                <ChevronRight size={13} color={colors.accent} />
              </View>
            ) : (
              <Text style={[styles.noDataText, { color: colors.heroMuted }]}>
                {needsPermission
                  ? 'Recovery uses sleep and HRV. Connect in Settings.'
                  : 'Sleep, HRV and resting HR aren’t connected yet.'}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {hasData && (
          <>
            <Text style={[styles.summaryText, { color: colors.heroInk }]}>
              {dailyBrief.summary}
            </Text>

            {/* Drivers */}
            <View
              style={[
                styles.driversGrid,
                { borderTopColor: 'rgba(244, 244, 238, 0.1)' },
              ]}
            >
              {briefDrivers.map((driver) => (
                <View key={driver.label} style={styles.driverItem}>
                  <Text
                    style={[styles.driverLabel, { color: colors.heroMuted }]}
                  >
                    {driver.label}
                  </Text>
                  <Text style={[styles.driverVal, { color: colors.heroInk }]}>
                    {driver.value}
                    {driver.unit ? (
                      <Text style={[styles.driverUnit, { color: colors.heroMuted }]}>
                        {' '}{driver.unit}
                      </Text>
                    ) : null}
                  </Text>
                  <Text style={[styles.driverDelta, { color: colors.accent }]}>
                    {driver.delta}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Suggested Questions */}
        <View
          style={[
            styles.questionsSection,
            { borderTopColor: 'rgba(244, 244, 238, 0.1)' },
          ]}
        >
          <View style={styles.askHeader}>
            <Text style={[styles.askTitle, { color: colors.heroMuted }]}>
              Ask Coach
            </Text>
            <TouchableOpacity
              onPress={() => navigate('voiceCoach')}
              style={[
                styles.voiceIconBtn,
                { backgroundColor: 'rgba(244, 244, 238, 0.12)' },
              ]}
            >
              <Mic size={15} color={colors.heroInk} />
            </TouchableOpacity>
          </View>

          <View style={styles.questionsList}>
            {suggestedQuestions.map((q) => (
              <TouchableOpacity
                key={q}
                activeOpacity={0.7}
                onPress={() => askCoach(q)}
                style={[
                  styles.questionChip,
                  { backgroundColor: 'rgba(244, 244, 238, 0.08)' },
                ]}
              >
                <Text style={[styles.questionText, { color: colors.heroInk }]}>
                  {q}
                </Text>
              </TouchableOpacity>
            ))}
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
  heroCard: {
    borderRadius: 28,
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  updatedText: {
    fontSize: 12,
  },
  recoveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 18,
  },
  recoveryVal: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  recoveryLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  headlineColumn: {
    flex: 1,
  },
  headlineText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginTop: 8,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  recText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  noDataText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 16,
    opacity: 0.9,
  },
  driversGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
  },
  driverItem: {
    flex: 1,
  },
  driverLabel: {
    fontSize: 12,
  },
  driverVal: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginTop: 2,
  },
  driverUnit: {
    fontSize: 12,
    fontWeight: '400',
  },
  driverDelta: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  questionsSection: {
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 14,
  },
  askHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  askTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  voiceIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionsList: {
    gap: 6,
  },
  questionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  questionText: {
    fontSize: 13.5,
    fontWeight: '500',
  },
});

