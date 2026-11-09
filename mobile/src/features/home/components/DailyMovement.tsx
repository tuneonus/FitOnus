import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Activity, Watch, Moon, Heart } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import type { DailySummary } from '@/features/dashboard/api/dashboard-repository';
import { useTheme } from '@/hooks/use-theme';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { MetricDisplay } from '@/shared/components/ui/MetricDisplay';
import { ActionRow } from '@/shared/components/ui/ActionRow';

export function DailyMovement({ summary }: { summary: DailySummary | undefined }) {
  const { colors } = useTheme();
  const { navigate, switchTab } = useNavigation();
  return (
    <View>
      <SectionHeader
        title="Beyond the workout"
        appearance="premium"
        actionLabel="Activity"
        onAction={() => switchTab('activity')}
      />
      <View style={[styles.metrics, { borderColor: colors.line }]}>
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
      </View>
      {summary?.steps == null ? (
        <ActionRow
          icon={Watch}
          title="Connect your health data"
          detail="Bring steps, sleep and recovery together."
          onPress={() => navigate('healthIntegration')}
        />
      ) : (
        <ActionRow
          icon={Activity}
          title="Your activity"
          detail="See your daily movement in detail."
          onPress={() => switchTab('activity')}
        />
      )}
      <ActionRow
        icon={Moon}
        title="Sleep"
        detail={summary?.sleepDuration ?? 'No sleep data synced yet'}
        onPress={() => navigate('sleep')}
      />
      <ActionRow
        icon={Heart}
        title="Recovery"
        detail={
          summary?.recoveryScore == null
            ? 'No recovery score available yet'
            : `${summary.recoveryScore} out of 100 · View details`
        }
        onPress={() => navigate('recovery')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  divider: { width: StyleSheet.hairlineWidth },
});
