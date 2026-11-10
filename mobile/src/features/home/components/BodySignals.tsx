import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Moon, HeartPulse, Scale, ChevronRight } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import type { RouteName } from '../../../app/navigation/routes';
import { Sparkline } from '../../../shared/components/charts/Sparkline';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { SourceTag } from '../../../shared/components/ui/SourceTag';
import { useHasDeviceData } from '../../health-integration/store/healthStore';
import { useWeightStore } from '../../weight-tracking/store/weightStore';
import { BodySignal, bodySignals } from '../data/homeMock';
import { useTheme } from '@/hooks/use-theme';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

export function BodySignals() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const hasDevice = useHasDeviceData();
  const weights = useWeightStore((s) => s.entries);

  const latest = weights[weights.length - 1];
  const monthAgo = weights.length > 22 ? weights[weights.length - 22] : weights[0];

  const weightSignal: BodySignal = {
    key: 'weight',
    label: 'Weight',
    value: latest ? latest.value.toFixed(1) : '—',
    unit: latest ? 'kg' : '',
    meta: latest
      ? monthAgo && latest !== monthAgo
        ? `${(latest.value - monthAgo.value).toFixed(1)} kg over time`
        : `Logged on ${latest.date}`
      : 'No weigh-ins logged yet',
    source: { kind: 'manual', label: latest ? `Logged ${latest.time ?? latest.date}` : 'Manual entry' },
    requiresDevice: false,
    ...(weights.length > 1 ? { series: weights.slice(-9).map((w) => w.value) } : {}),
  };

  const signals = [...bodySignals, weightSignal];

  const getSignalConfig = (key: BodySignal['key']) => {
    switch (key) {
      case 'sleep':
        return { icon: Moon, color: colors.sleep, route: 'sleep' as RouteName };
      case 'heart':
        return {
          icon: HeartPulse,
          color: colors.move,
          route: 'recovery' as RouteName,
        };
      case 'weight':
        return {
          icon: Scale,
          color: colors.ink,
          route: 'weight' as RouteName,
        };
    }
  };

  return (
    <View style={styles.container}>
      <SectionHeader title="Body signals" />

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        {signals.map((signal, idx) => {
          const available = hasDevice || !signal.requiresDevice;
          const { icon: Icon, color, route } = getSignalConfig(signal.key);

          return (
            <TouchableOpacity
              key={signal.key}
              activeOpacity={0.7}
              onPress={() =>
                navigate(available ? route : WEARABLES_ENABLED ? 'healthIntegration' : route)
              }
              style={[
                styles.signalRow,
                idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
              ]}
            >
              <View
                style={[styles.iconBox, { backgroundColor: colors.surface2 }]}
              >
                <Icon size={19} color={color} />
              </View>

              <View style={styles.contentCol}>
                <Text style={[styles.signalLabel, { color: colors.muted }]}>
                  {signal.label}
                </Text>

                {available ? (
                  <>
                    <Text style={[styles.signalValue, { color: colors.ink }]}>
                      {signal.value}
                      {signal.unit ? (
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {' '}{signal.unit}
                        </Text>
                      ) : null}
                    </Text>
                    <Text style={[styles.signalMeta, { color: colors.muted }]}>
                      {signal.meta}
                    </Text>
                    <View style={styles.sourceTagRow}>
                      <SourceTag source={signal.source} />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.noDataTitle, { color: colors.ink }]}>
                      No data yet
                    </Text>
                    <Text style={[styles.noDataSub, { color: colors.muted }]}>
                      {WEARABLES_ENABLED
                        ? 'Needs Apple Health or a wearable'
                        : 'No tracking data logged yet'}
                    </Text>
                  </>
                )}
              </View>

              {/* Sparkline or stages */}
              {available && signal.series ? (
                <Sparkline
                  values={signal.series}
                  color={color}
                  style={styles.sparkline}
                />
              ) : null}

              <ChevronRight size={18} color={colors.muted} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCol: {
    flex: 1,
  },
  signalLabel: {
    fontSize: 12,
  },
  signalValue: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  signalMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  sourceTagRow: {
    marginTop: 4,
  },
  noDataTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    marginTop: 2,
  },
  noDataSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sparkline: {
    marginRight: 6,
  },
});

