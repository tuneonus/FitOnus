import React from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Activity } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { SourceTag } from '@/shared/components/ui/SourceTag';
import { ProgressRing } from '@/shared/components/charts/ProgressRing';
import { LineChart } from '@/shared/components/charts/LineChart';
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { progressApi } from '@/features/progress/api/progress-api';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

export function RecoveryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const dashboard = useDashboard();
  const userId = useAuthStore((s) => s.user?.id);
  const history = useQuery({
    queryKey: ['dashboard', 'recovery-history', userId],
    queryFn: () =>
      progressApi.getAnalytics({
        metric: 'recovery',
        range: 'M',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    enabled: !!userId,
  });
  const score = dashboard.data?.summary.recoveryScore;
  return (
    <Screen
      title="Recovery"
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={dashboard.isRefetching || history.isRefetching}
          onRefresh={() => {
            void dashboard.refetch();
            void history.refetch();
          }}
          tintColor={colors.accentStrong}
        />
      }
    >
      {dashboard.isError || history.isError ? (
        <StatusBanner
          tone="error"
          title="Couldn’t refresh recovery"
          body="Pull to try again. Previously loaded data may be out of date."
        />
      ) : null}
      {score != null ? (
        <View style={[styles.heroCard, { backgroundColor: colors.surface2 }]}>
          <View style={styles.heroContent}>
            <ProgressRing size={120} strokeWidth={11} value={score / 100} color={colors.accentStrong}>
              <Text style={[styles.scoreNumber, { color: colors.ink }]}>{score}</Text>
            </ProgressRing>
            <View style={styles.heroDetails}>
              <Text style={[styles.primeHeading, { color: colors.ink }]}>Recovery score</Text>
              <SourceTag source={{ kind: 'synced', label: 'Account recovery data' }} />
            </View>
          </View>
        </View>
      ) : !dashboard.isLoading ? (
        <EmptyState
          icon={Activity}
          title="No recovery data yet"
          body={
            WEARABLES_ENABLED
              ? 'No recovery records are available for your account. Wearable syncing is not available in this build.'
              : 'No recovery records are available for your account yet.'
          }
          actionLabel={WEARABLES_ENABLED ? 'Health connections' : undefined}
          onAction={WEARABLES_ENABLED ? () => navigate('healthIntegration') : undefined}
        />
      ) : (
        <Text style={{ color: colors.muted }}>Loading recovery data…</Text>
      )}
      {history.data?.points.length ? (
        <View
          style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <Text style={[styles.trendHeading, { color: colors.ink }]}>Recovery trend</Text>
          <LineChart points={history.data.points} height={150} strokeColor={colors.accent} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
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
