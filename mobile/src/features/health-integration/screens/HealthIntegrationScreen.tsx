import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { HeartPulse, RefreshCw, Smartphone, Watch } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Toggle } from '@/shared/components/ui/Toggle';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { ConfirmDialog } from '@/shared/components/ui/ConfirmDialog';
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { showToast } from '@/shared/stores/toastStore';
import type { HealthPlatform } from '@/shared/types/health';
import { useHealthStore } from '../store/healthStore';
import { healthConnectApps, healthMetrics } from '../constants/healthMetrics';
import { useTheme } from '@/hooks/use-theme';

const groups = ['Activity', 'Heart', 'Sleep', 'Body', 'Vitals', 'Other'] as const;

export function HealthIntegrationScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const {
    platform,
    setPlatform,
    connection,
    setConnection,
    lastSync,
    permissions,
    setPermission,
    setAllPermissions,
    syncNow,
    status,
    watchConnected,
  } = useHealthStore();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const name = platform === 'ios' ? 'Apple Health' : 'Health Connect';
  const connected = connection === 'connected';

  const connect = () => {
    showToast({
      message: `${name} syncing is not available in this build yet. Your manually logged data is available.`,
    });
  };

  return (
    <Screen title="Health connections">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <SegmentedControl<HealthPlatform>
          options={[
            { value: 'ios', label: 'iPhone' },
            { value: 'android', label: 'Android' },
          ]}
          value={platform}
          onChange={setPlatform}
        />

        {/* Status card */}
        <View
          style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={styles.platformRow}>
            <View style={[styles.iconSquare, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
              <HeartPulse size={24} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.platformName, { color: colors.ink }]}>{name}</Text>
              <Text style={[styles.platformSub, { color: colors.muted }]}>
                {platform === 'ios'
                  ? 'HealthKit on this iPhone'
                  : 'Android’s shared health data hub'}
              </Text>
            </View>
            {connected && <Badge tone="good">Connected</Badge>}
            {connection === 'error' && <Badge tone="bad">Error</Badge>}
          </View>

          {connected && (
            <View style={[styles.syncBar, { borderTopColor: colors.line }]}>
              <Text style={[styles.syncText, { color: colors.muted }]}>
                {status === 'loading' ? 'Syncing…' : `Last synced ${lastSync}`}
              </Text>
              <Button
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                loading={status === 'loading'}
                onPress={syncNow}
              >
                Sync now
              </Button>
            </View>
          )}

          {connection === 'disconnected' && (
            <View style={{ gap: 12, marginTop: 14 }}>
              <Text style={[styles.disconnectedBody, { color: colors.ink }]}>
                Wearable health syncing is not available in this build yet. Workouts, nutrition and
                body measurements you log in FitOnus are saved to your account.
              </Text>
              <Button size="lg" fullWidth onPress={connect}>
                Connect {name}
              </Button>
            </View>
          )}

          {connection === 'connecting' && (
            <View style={styles.connectingRow}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={[styles.connectingText, { color: colors.muted }]}>
                Waiting for {platform === 'ios' ? 'the iOS permission sheet' : 'Health Connect'}…
              </Text>
            </View>
          )}

          {connection === 'error' && (
            <View style={{ marginTop: 12 }}>
              <StatusBanner
                tone="error"
                title="Sync failed"
                body={`${name} didn’t respond. Data from ${lastSync} is still shown.`}
                actionLabel="Retry"
                onAction={() => {
                  connect();
                }}
              />
            </View>
          )}
        </View>

        {status === 'permissions' && connected && (
          <StatusBanner
            tone="warning"
            title="Some permissions are off"
            body="Recovery needs Sleep and HRV. Without them it can’t be calculated."
          />
        )}

        {/* Android Health Connect apps */}
        {platform === 'android' && connected && (
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionHeading, { color: colors.ink }]}>
              Apps sharing through Health Connect
            </Text>
            <ListGroup>
              {healthConnectApps.map((a) => (
                <ListRow
                  key={a.name}
                  icon={Smartphone}
                  title={a.name}
                  subtitle={a.detail}
                  chevron={false}
                  trailing={
                    a.status === 'connected' ? (
                      <Badge tone="good">Sharing</Badge>
                    ) : a.status === 'available' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() =>
                          showToast({
                            message: `Opens Health Connect to allow ${a.name}`,
                          })
                        }
                      >
                        Allow
                      </Button>
                    ) : (
                      <Badge>Not installed</Badge>
                    )
                  }
                />
              ))}
            </ListGroup>
            <Text style={[styles.footnote, { color: colors.muted }]}>
              What’s available depends on which apps you’ve installed and what they share.
            </Text>
          </View>
        )}

        {/* Apple Watch row on iOS */}
        {platform === 'ios' && (
          <ListGroup>
            <ListRow
              icon={Watch}
              title="Apple Watch"
              subtitle={watchConnected ? 'Series 9 · synced through Apple Health' : 'Not paired'}
              onPress={() => navigate('appleWatch')}
            />
          </ListGroup>
        )}

        {/* Metric Permission groups */}
        {connected &&
          groups.map((g) => {
            const list = healthMetrics.filter((m) => m.group === g);
            return (
              <View key={g} style={styles.groupSection}>
                <Text style={[styles.groupHeading, { color: colors.muted }]}>{g}</Text>
                <View
                  style={[
                    styles.listCard,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}
                >
                  {list.map((m, idx) => (
                    <View
                      key={m.key}
                      style={[
                        styles.metricRow,
                        { borderBottomColor: colors.line },
                        idx === list.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={[
                            styles.metricLabel,
                            {
                              color: m.availability === 'unavailable' ? colors.muted : colors.ink,
                            },
                          ]}
                        >
                          {m.label}
                        </Text>
                        <Text style={[styles.metricSub, { color: colors.muted }]}>
                          {m.availability === 'available' ? m.source : m.note}
                        </Text>
                      </View>

                      {m.availability === 'unavailable' ? (
                        <Badge>Unavailable</Badge>
                      ) : (
                        <View style={styles.toggleWithBadge}>
                          {m.availability === 'noData' && <Badge tone="warn">No data</Badge>}
                          <Toggle
                            checked={permissions[m.key] ?? false}
                            onChange={(v) => setPermission(m.key, v)}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

        {/* Disconnect action */}
        {connected && (
          <View style={styles.disconnectBlock}>
            <Button fullWidth variant="danger" onPress={() => setConfirmDisconnect(true)}>
              Disconnect {name}
            </Button>
            <Text style={[styles.disconnectFootnote, { color: colors.muted }]}>
              Your logged meals, workouts and weights stay in FitOnus.
            </Text>
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        open={confirmDisconnect}
        title={`Disconnect ${name}?`}
        message="Recovery, sleep and heart-rate insights will stop updating. Steps will be estimated from your phone where possible."
        confirmLabel="Disconnect"
        destructive
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConnection('disconnected');
          setConfirmDisconnect(false);
          showToast({ message: `${name} disconnected` });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  statusCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconSquare: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformName: {
    fontSize: 17,
    fontWeight: '600',
  },
  platformSub: {
    fontSize: 13,
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  syncText: {
    fontSize: 13,
  },
  disconnectedBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  connectingText: {
    fontSize: 13.5,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  footnote: {
    fontSize: 12,
    paddingHorizontal: 4,
  },
  groupSection: {
    gap: 8,
  },
  groupHeading: {
    fontSize: 13,
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
    gap: 10,
  },
  metricLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  metricSub: {
    fontSize: 12,
  },
  toggleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disconnectBlock: {
    gap: 8,
    marginTop: 8,
  },
  disconnectFootnote: {
    fontSize: 12,
    textAlign: 'center',
  },
});
