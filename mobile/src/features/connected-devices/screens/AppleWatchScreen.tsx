import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  CheckCircle2,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  RefreshCw,
  Timer,
  Watch,
} from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { showToast } from '@/shared/stores/toastStore';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useTheme } from '@/hooks/use-theme';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

const synced = [Heart, Dumbbell, Footprints, Flame, Timer].map((icon, index) => ({
  icon,
  label: ['Heart rate', 'Workouts', 'Steps', 'Active calories', 'Exercise minutes'][index],
  value: '—',
}));
const watchWorkouts: { title: string; when: string; status: 'synced' | 'pending' }[] = [];

export function AppleWatchScreen() {
  // Gate before any hooks run so the Rules of Hooks hold; the screen stays hidden when disabled.
  if (!WEARABLES_ENABLED) {
    return null;
  }
  return <AppleWatchScreenContent />;
}

function AppleWatchScreenContent() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { watchConnected, setWatchConnected, lastSync, syncNow, status, connection } =
    useHealthStore();

  if (!watchConnected) {
    return (
      <Screen title="Apple Watch">
        <EmptyState
          icon={Watch}
          title="No Apple Watch found"
          body="Apple Watch syncing is not available in this build yet. Your manually logged workouts remain available."
          actionLabel="Health connections"
          onAction={() => {
            navigate('healthIntegration');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Apple Watch" contentContainerStyle={styles.container}>
      {/* Watch Hero Card */}
      <View style={[styles.heroCard, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.heroIconBox, { backgroundColor: colors.surface }]}>
          <Watch size={28} color={colors.accentStrong} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.heroTitle, { color: colors.ink }]}>Apple Watch</Text>
          <Text style={[styles.heroSub, { color: colors.muted }]}>Via Apple Health</Text>
          <Text style={[styles.heroSync, { color: colors.muted }]}>
            {status === 'loading' ? 'Syncing…' : `Last synced ${lastSync}`}
          </Text>
        </View>
        <Button
          size="sm"
          variant="secondary"
          icon={RefreshCw}
          loading={status === 'loading'}
          onPress={syncNow}
        >
          Sync
        </Button>
      </View>

      {connection !== 'connected' && (
        <StatusBanner
          tone="warning"
          title="Apple Health is disconnected"
          body="Watch data reaches OnusFit through Apple Health."
          actionLabel="Fix"
          onAction={() => navigate('healthIntegration')}
        />
      )}

      {/* Synced metrics */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionHeading, { color: colors.ink }]}>Synced from your watch</Text>
        <View
          style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          {synced.map((s, idx) => {
            const Icon = s.icon;
            return (
              <View
                key={s.label}
                style={[
                  styles.metricRow,
                  { borderBottomColor: colors.line },
                  idx === synced.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Icon size={17} color={colors.ink} />
                <Text style={[styles.metricLabel, { color: colors.ink }]}>{s.label}</Text>
                <Text style={[styles.metricVal, { color: colors.muted }]}>{s.value}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Watch-started workouts */}
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionHeading, { color: colors.ink }]}>Watch-started workouts</Text>
        <View
          style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          {watchWorkouts.map((w, idx) => (
            <View
              key={w.title}
              style={[
                styles.workoutRow,
                { borderBottomColor: colors.line },
                idx === watchWorkouts.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.workoutTitle, { color: colors.ink }]}>{w.title}</Text>
                <Text style={[styles.workoutWhen, { color: colors.muted }]}>{w.when}</Text>
              </View>
              {w.status === 'synced' ? (
                <Badge tone="good">In history</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    syncNow();
                    showToast({ message: 'Walk added to workout history' });
                  }}
                >
                  Import
                </Button>
              )}
            </View>
          ))}
        </View>
        <Text style={[styles.footnote, { color: colors.muted }]}>
          Workouts recorded on the watch become workout records here, with heart rate attached.
        </Text>
      </View>

      {/* Future support */}
      <View style={[styles.futureCard, { borderColor: colors.line }]}>
        <View style={styles.futureHeader}>
          <Text style={[styles.futureTitle, { color: colors.ink }]}>Coming later</Text>
          <Badge>Future</Badge>
        </View>
        <View style={styles.futureList}>
          <Text style={[styles.futureItem, { color: colors.muted }]}>
            • OnusFit watch app with live set logging
          </Text>
          <Text style={[styles.futureItem, { color: colors.muted }]}>
            • Wear OS companion via Health Connect
          </Text>
          <Text style={[styles.futureItem, { color: colors.muted }]}>
            • Live Activities and Dynamic Island during workouts
          </Text>
        </View>
        <View style={{ alignSelf: 'flex-start', marginTop: 10 }}>
          <Button size="sm" variant="secondary" onPress={() => navigate('wearOs')}>
            Wear OS plans
          </Button>
        </View>
      </View>

      {/* Remove watch */}
      <View style={{ marginTop: 4 }}>
        <Button
          fullWidth
          variant="ghost"
          onPress={() => {
            setWatchConnected(false);
            showToast({ message: 'Apple Watch removed from OnusFit' });
          }}
        >
          Stop using this watch
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 28,
    gap: 14,
  },
  heroIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  heroSub: {
    fontSize: 13,
  },
  heroSync: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 12,
  },
  metricLabel: {
    fontSize: 15,
    flex: 1,
  },
  metricVal: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 12,
  },
  workoutTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  workoutWhen: {
    fontSize: 12,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  futureCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 18,
    gap: 8,
  },
  futureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  futureTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  futureList: {
    gap: 4,
    marginTop: 4,
  },
  futureItem: {
    fontSize: 13.5,
    lineHeight: 19,
  },
});
