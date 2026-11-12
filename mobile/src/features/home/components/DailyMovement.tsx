import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Activity, Watch, Moon, Heart } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import type { DailySummary } from '@/features/dashboard/api/dashboard-repository';
import { useTheme } from '@/hooks/use-theme';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { MetricDisplay } from '@/shared/components/ui/MetricDisplay';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { Card } from '@/shared/components/ui/Card';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

export function DailyMovement({ summary }: { summary: DailySummary | undefined }) {
  const { colors } = useTheme();
  const { navigate, switchTab } = useNavigation();
  return (
    <View>
      <SectionHeader
        title="Beyond the workout"
        actionLabel="Activity"
        onAction={() => switchTab('activity')}
      />
      <Card style={styles.metrics}>
        <MetricDisplay
          label="Daily steps"
          value={summary?.steps == null ? '—' : summary.steps.toLocaleString()}
          detail={summary?.steps == null ? 'No synced steps' : 'Synced activity'}
        />
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        <MetricDisplay
          label="Active time"
          value={summary ? String(summary.activeMinutes) : '—'}
          unit="min"
          detail="Logged movement"
        />
      </Card>
      <ListGroup style={styles.group}>
        {summary?.steps == null ? (
          WEARABLES_ENABLED ? (
            <ListRow
              icon={Watch}
              title="Connect your health data"
              subtitle="Bring steps, sleep and recovery together."
              onPress={() => navigate('healthIntegration')}
            />
          ) : null
        ) : (
          <ListRow
            icon={Activity}
            title="Your activity"
            subtitle="See your daily movement in detail."
            onPress={() => switchTab('activity')}
          />
        )}
        <ListRow
          icon={Moon}
          title="Sleep"
          subtitle={summary?.sleepDuration ?? 'No sleep data synced yet'}
          onPress={() => navigate('sleep')}
        />
        <ListRow
          icon={Heart}
          title="Recovery"
          subtitle={
            summary?.recoveryScore == null
              ? 'No recovery score available yet'
              : `${summary.recoveryScore} out of 100 · View details`
          }
          onPress={() => navigate('recovery')}
        />
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: 'row',
    gap: 20,
  },
  group: { marginTop: 12, marginVertical: 0 },
  divider: { width: StyleSheet.hairlineWidth },
});
