import React, { useState } from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Moon } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { SourceTag } from '@/shared/components/ui/SourceTag';
import { ProgressRing } from '@/shared/components/charts/ProgressRing';
import { BarChart } from '@/shared/components/charts/BarChart';
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { progressApi } from '@/features/progress/api/progress-api';
import { useTheme } from '@/hooks/use-theme';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

export function SleepScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const dashboard = useDashboard();
  const [view, setView] = useState<'night' | 'trends'>('night');
  const userId = useAuthStore((s) => s.user?.id);
  const history = useQuery({
    queryKey: ['dashboard', 'sleep-history', userId],
    queryFn: () =>
      progressApi.getAnalytics({
        metric: 'sleep',
        range: 'M',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    enabled: !!userId,
  });
  const summary = dashboard.data?.summary;
  const hasData = summary?.sleepScore != null || summary?.sleepDuration != null;
  const refreshControl = (
    <RefreshControl
      refreshing={dashboard.isRefetching || history.isRefetching}
      onRefresh={() => {
        void dashboard.refetch();
        void history.refetch();
      }}
      tintColor={colors.accentStrong}
    />
  );
  return (
    <Screen title="Sleep" contentContainerStyle={styles.container} refreshControl={refreshControl}>
      {dashboard.isError || history.isError ? (
        <StatusBanner
          tone="error"
          title="Couldn’t refresh sleep"
          body="Pull to try again. Previously loaded data may be out of date."
        />
      ) : null}
      <SegmentedControl
        options={[
          { value: 'night', label: 'Last night' },
          { value: 'trends', label: 'Trends' },
        ]}
        value={view}
        onChange={(value) => setView(value as 'night' | 'trends')}
      />
      {view === 'night' && hasData ? (
        <View
          style={[
            styles.card,
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}
        >
          {summary?.sleepScore != null ? (
            <ProgressRing
              size={104}
              strokeWidth={9}
              value={summary.sleepScore / 100}
              color="#7C3AED"
            >
              <Text style={[styles.scoreNumber, { color: colors.ink }]}>{summary.sleepScore}</Text>
            </ProgressRing>
          ) : null}
          <View style={styles.summaryDetails}>
            <Text style={[styles.sleepDuration, { color: colors.ink }]}>
              {summary?.sleepDuration ?? 'Duration unavailable'}
            </Text>
            <SourceTag source={{ kind: 'synced', label: 'Account sleep data' }} />
            <Text style={[styles.sleepHours, { color: colors.muted }]}>
              Sleep stages are not available yet.
            </Text>
          </View>
        </View>
      ) : view === 'trends' && history.data?.points.length ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <BarChart
            data={history.data.points}
            height={140}
            barColor="#7C3AED"
            formatValue={(value) => `${value} h`}
          />
        </View>
      ) : !dashboard.isLoading && !history.isLoading ? (
        <EmptyState
          icon={Moon}
          title="No sleep data yet"
          body={
            WEARABLES_ENABLED
              ? 'No sleep records are available for your account. Wearable syncing is not available in this build.'
              : 'No sleep records are available for your account yet.'
          }
          actionLabel={WEARABLES_ENABLED ? 'Health connections' : undefined}
          onAction={WEARABLES_ENABLED ? () => navigate('healthIntegration') : undefined}
        />
      ) : (
        <Text style={{ color: colors.muted }}>Loading sleep data…</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  viewContent: {
    gap: 16,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  scoreCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  scoreLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  summaryDetails: {
    flex: 1,
    gap: 2,
  },
  sleepDuration: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  sleepHours: {
    fontSize: 13,
  },
  sleepDiff: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  stagesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
  },
  stageCol: {
    gap: 2,
  },
  stageDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  stageLabel: {
    fontSize: 12,
  },
  stageMin: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stagePct: {
    fontSize: 11,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardSub: {
    fontSize: 12,
  },
  footnote: {
    fontSize: 12,
    marginTop: 8,
  },
  consistencyList: {
    gap: 8,
    marginTop: 12,
  },
  consistencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cDate: {
    width: 44,
    fontSize: 11.5,
  },
  cTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  cFill: {
    position: 'absolute',
    height: 10,
    borderRadius: 5,
    opacity: 0.7,
  },
  cBed: {
    width: 50,
    textAlign: 'right',
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },
  historyBlock: {
    gap: 8,
  },
  historyHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowDate: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowStages: {
    fontSize: 12,
  },
  rowDur: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowScore: {
    fontSize: 11.5,
  },
});
