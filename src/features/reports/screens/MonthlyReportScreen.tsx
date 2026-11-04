import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { LineChart } from '@/shared/components/charts/LineChart';
import { Button } from '@/shared/components/ui/Button';
import { getMonthlyReport } from '../data/reportsMock';
import { useTheme } from '@/hooks/use-theme';

export function MonthlyReportScreen() {
  const { colors } = useTheme();
  const params = useRouteParams<{ period?: string; id?: string }>();
  const period = params.period;
  const id = params.id;
  const r = getMonthlyReport(id);
  const { navigate } = useNavigation();

  return (
    <Screen
      title="Monthly report"
      footer={
        <Button
          size="lg"
          fullWidth
          onPress={() => navigate('coach', { q: 'Compare this month with last month' })}
        >
          Compare with coach
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={[styles.metaText, { color: colors.muted }]}>
            {period ?? r.month} · Generated {r.generated}
          </Text>
          <Text style={[styles.headline, { color: colors.ink }]}>{r.headline}</Text>
        </View>

        {/* 2x2 Stats Grid */}
        <View style={[styles.statsGrid, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          {r.stats.map((s, idx) => (
            <View
              key={s.label}
              style={[
                styles.statItem,
                idx % 2 === 0 && { borderRightWidth: 1, borderRightColor: colors.line },
                idx < 2 && { borderBottomWidth: 1, borderBottomColor: colors.line },
              ]}
            >
              <Text style={[styles.statLabel, { color: colors.muted }]}>{s.label}</Text>
              <View style={styles.statValRow}>
                <Text style={[styles.statVal, { color: colors.ink }]}>{s.value}</Text>
                <Text style={[styles.statUnit, { color: colors.muted }]}>{s.unit}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Weight trend 6 months */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Weight · 6 months</Text>
          <View style={{ marginTop: 8 }}>
            <LineChart
              points={r.weightTrend}
              target={75}
              targetLabel="Goal 75"
              formatValue={(v) => `${v} kg`}
              height={140}
              strokeColor={colors.accent}
            />
          </View>
        </View>

        {/* Average recovery 6 months */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Average recovery · 6 months</Text>
          <View style={{ marginTop: 8 }}>
            <LineChart
              points={r.recoveryTrend}
              height={120}
              strokeColor={colors.accent}
            />
          </View>
        </View>

        {/* Long-term trends */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>Long-term trends</Text>
          <View style={styles.trendsList}>
            {r.trends.map((t) => (
              <View key={t} style={[styles.trendItem, { borderLeftColor: colors.line }]}>
                <Text style={[styles.trendText, { color: colors.ink }]}>{t}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI recommendations */}
        <View style={[styles.recsCard, { backgroundColor: colors.surface2 }]}>
          <View style={styles.recsHeader}>
            <Sparkles size={14} color={colors.accent} />
            <Text style={[styles.recsTitle, { color: colors.muted }]}>
              AI recommendations for October
            </Text>
          </View>
          <View style={styles.recsList}>
            {r.recommendations.map((rec, i) => (
              <View key={rec.title} style={styles.recRow}>
                <Text style={[styles.recNum, { color: colors.accent }]}>{i + 1}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.recHeading, { color: colors.ink }]}>{rec.title}</Text>
                  <Text style={[styles.recDetail, { color: colors.muted }]}>{rec.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
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
  headerBlock: {
    paddingHorizontal: 4,
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statItem: {
    width: '50%',
    padding: 16,
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  statValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  statVal: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 12,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionBlock: {
    gap: 8,
    paddingHorizontal: 4,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
  },
  trendsList: {
    gap: 10,
    marginTop: 4,
  },
  trendItem: {
    borderLeftWidth: 2,
    paddingLeft: 12,
    paddingVertical: 2,
  },
  trendText: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  recsCard: {
    borderRadius: 28,
    padding: 20,
    gap: 12,
  },
  recsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recsTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  recsList: {
    gap: 12,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  recNum: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recHeading: {
    fontSize: 15,
    fontWeight: '600',
  },
  recDetail: {
    fontSize: 13,
    lineHeight: 18,
  },
});

