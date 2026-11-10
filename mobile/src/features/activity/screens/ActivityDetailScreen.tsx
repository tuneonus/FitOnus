import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { ActivityType, activityTypes } from '../constants/activity-types';
import { useTheme } from '@/hooks/use-theme';

export function ActivityDetailScreen() {
  const { colors } = useTheme();
  const { type = 'steps' } = useRouteParams<{ type?: ActivityType }>();
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const t = activityTypes[type as ActivityType] ?? activityTypes.steps;

  if (t.series.length === 0) {
    return (
      <Screen title={t.label}>
        <EmptyState
          icon={t.icon}
          title={`No ${t.label.toLowerCase()} yet`}
          description={
            type === 'steps'
              ? 'Step counting requires a connected Apple Watch, Wear OS device, or Health Connect integration.'
              : `No synced activity records are available from your account yet.`
          }
          actionLabel="Connect a device"
          onAction={() => navigate('healthIntegration')}
        />
      </Screen>
    );
  }

  return (
    <Screen title={t.label}>
      <View style={styles.header}>
        <Text style={[styles.subtitle, { color: colors.muted }]}>This week</Text>
        <Text style={[styles.bigValue, { color: colors.ink }]}>{t.week}</Text>
        <Text style={[styles.detail, { color: colors.muted }]}>{t.detail}</Text>
      </View>

      {t.series.length === 0 ? (
        <EmptyState
          icon={t.icon}
          title={`No ${t.label.toLowerCase()} yet`}
          description="Start a pool or open-water swim on Apple Watch and it will sync here with distance, laps and heart rate."
          actionLabel="Check device connection"
          onAction={() => navigate('appleWatch')}
        />
      ) : (
        <View style={styles.body}>
          <View
            style={[
              styles.chartCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <BarChart
              data={t.series}
              formatValue={(v) => `${v.toLocaleString()} ${t.unit}`}
              barColor={colors.sky}
              height={120}
              goal={type === 'steps' ? 10000 : undefined}
            />
          </View>

          {t.sessions.length > 0 && (
            <View style={styles.sessionsSection}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Sessions</Text>
              <View
                style={[
                  styles.sessionsCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                  },
                ]}
              >
                {t.sessions.map((s, idx) => {
                  const isLast = idx === t.sessions.length - 1;
                  return (
                    <View
                      key={s.date}
                      style={[
                        styles.sessionRow,
                        !isLast && {
                          borderBottomWidth: 1,
                          borderBottomColor: colors.line,
                        },
                      ]}
                    >
                      <View style={styles.sessionHeaderRow}>
                        <Text style={[styles.sessionTitle, { color: colors.ink }]}>{s.title}</Text>
                        <Text style={[styles.sessionDate, { color: colors.muted }]}>{s.date}</Text>
                      </View>
                      <Text style={[styles.sessionStats, { color: colors.muted }]}>{s.stats}</Text>
                      <View style={{ marginTop: 4 }}>
                        <SourceTag source={{ kind: 'synced', label: 'Apple Watch workout' }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 13,
  },
  bigValue: {
    fontSize: 36,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  detail: {
    fontSize: 13,
  },
  body: {
    paddingHorizontal: 16,
    gap: 24,
    paddingBottom: 32,
  },
  chartCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  sessionsSection: {},
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sessionsCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sessionRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sessionDate: {
    fontSize: 12,
  },
  sessionStats: {
    fontSize: 12.5,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
