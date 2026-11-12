import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Sparkles, Target } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { LineChart } from '@/shared/components/charts/LineChart';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { useTheme } from '@/hooks/use-theme';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/features/analytics/api/analytics-api';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { hasReportRecords, useProgressReport } from '../hooks/use-progress-report';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { useHasDeviceData } from '@/features/health-integration/store/healthStore';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

export function MonthlyReportScreen() {
  const { colors } = useTheme();

  const params = useRouteParams<{ period?: string; id?: string }>();
  const period = params.period;
  const report = useProgressReport('monthly');
  const monthlyReport = report.data;
  const userId = useAuthStore((s) => s.user?.id);
  const body = useQuery({
    queryKey: ['dashboard', 'monthly-body-trend', userId],
    queryFn: () => analyticsApi.getBody({ range: '6M' }),
    enabled: !!userId,
  });
  const refreshControl = (
    <RefreshControl
      refreshing={report.isRefetching || body.isRefetching}
      onRefresh={() => {
        void report.refetch();
        void body.refetch();
      }}
      tintColor={colors.accentStrong}
    />
  );
  const { navigate } = useNavigation();

  if (!monthlyReport || !hasReportRecords(monthlyReport)) {
    return (
      <Screen title="Monthly report" refreshControl={refreshControl}>
        {report.isError ? (
          <StatusBanner tone="error" title="Couldn’t load your report" body="Pull to try again." />
        ) : null}
        {report.isLoading ? <Text style={{ color: colors.muted }}>Loading report…</Text> : null}
        <EmptyState
          icon={Target}
          title="No monthly report"
          body="Log workouts and nutrition consistently to generate your monthly report."
          actionLabel="Go to Workouts"
          onAction={() => navigate('workouts')}
        />
      </Screen>
    );
  }

  const r = {
    month: monthlyReport.period,
    generated: monthlyReport.generated,
    headline: monthlyReport.headline,
    stats: monthlyReport.stats,
    weightTrend:
      body.data?.weightTrend.map((point) => ({ label: point.date.slice(5), value: point.raw })) ??
      [],
    recoveryTrend: [] as { label: string; value: number }[],
    trends: monthlyReport.improvements || [],
    recommendations: (monthlyReport.nextGoals || []).map((g, idx) => ({
      title: `Goal ${idx + 1}`,
      detail: g,
    })),
  };

  return (
    <Screen
      title="Monthly report"
      refreshControl={refreshControl}
      footer={
        <Button
          size="lg"
          fullWidth
          onPress={() => navigate('coach', { q: 'Compare this month with last month' })}
        >
          Compare with coach
        </Button>
      }
      contentContainerStyle={styles.container}
    >
      <View style={styles.headerBlock}>
        <Text style={[styles.metaText, { color: colors.muted }]}>
          {period ?? r.month} · Generated {r.generated}
        </Text>
        <Text style={[styles.headline, { color: colors.ink }]}>{r.headline}</Text>
      </View>

      {/* 2x2 Stats Grid */}
      <View
        style={[styles.statsGrid, { backgroundColor: colors.surface, borderColor: colors.line }]}
      >
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
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Weight · recent 6 months</Text>
        {r.weightTrend.length === 0 ? (
          <EmptyState
            compact
            icon={Target}
            title="No weight history"
            body="Log a weigh-in to see your six-month trend here."
          />
        ) : (
          <View style={{ marginTop: 8 }}>
            <LineChart
              points={r.weightTrend}
              target={body.data?.targetWeightKg ?? undefined}
              formatValue={(v) => `${v} kg`}
              height={140}
              strokeColor={colors.accent}
            />
          </View>
        )}
      </View>

      {/* Average recovery 6 months */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Average recovery · 6 months</Text>
        {r.recoveryTrend.length === 0 ? (
          <EmptyState
            compact
            icon={Target}
            title="No recovery history"
            body="No recovery records are available for this account yet."
            actionLabel={WEARABLES_ENABLED ? 'Connect' : undefined}
            onAction={WEARABLES_ENABLED ? () => navigate('healthIntegration') : undefined}
          />
        ) : (
          <View style={{ marginTop: 8 }}>
            <LineChart points={r.recoveryTrend} height={120} strokeColor={colors.accent} />
          </View>
        )}
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
          <Sparkles size={14} color={colors.accentStrong} />
          <Text style={[styles.recsTitle, { color: colors.muted }]}>Report recommendations</Text>
        </View>
        <View style={styles.recsList}>
          {r.recommendations.map((rec, i) => (
            <View key={rec.title} style={styles.recRow}>
              <Text style={[styles.recNum, { color: colors.accentStrong }]}>{i + 1}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.recHeading, { color: colors.ink }]}>{rec.title}</Text>
                <Text style={[styles.recDetail, { color: colors.muted }]}>{rec.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
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
