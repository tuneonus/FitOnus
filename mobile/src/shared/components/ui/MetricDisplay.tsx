import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export function MetricDisplay({
  label,
  value,
  unit,
  detail,
  inverse = false,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  inverse?: boolean;
}) {
  const { colors } = useTheme();
  const ink = inverse ? colors.heroInk : colors.ink;
  const muted = inverse ? colors.heroMuted : colors.muted;
  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}${detail ? `. ${detail}` : ''}`}
    >
      <Text style={[premium.type.caption, { color: muted }]}>{label}</Text>
      <Text style={[styles.value, { color: ink }]}>
        {value}
        {unit ? <Text style={[styles.unit, { color: muted }]}> {unit}</Text> : null}
      </Text>
      {detail ? <Text style={[premium.type.caption, { color: muted }]}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0, gap: 4 },
  value: { ...premium.type.metric },
  unit: { ...premium.type.caption },
});
