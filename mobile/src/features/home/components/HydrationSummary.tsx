import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Droplets, Plus } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { premium } from '@/shared/theme/premium';
import { type HomeNutrition, progressRatio } from '../utils/home-overview';

export function HydrationSummary({
  overview,
  onOpen,
}: {
  overview: HomeNutrition;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const value = overview.waterMl;
  const goal = overview.goals.waterMl;
  return (
    <View>
      <SectionHeader title="Hydration" />
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: colors.infoLight }]}>
            <Droplets size={20} color={colors.info} strokeWidth={2} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.value, { color: colors.ink }]}>
              {value === null
                ? '—'
                : (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <Text style={[premium.type.label, { color: colors.muted }]}> L</Text>
            </Text>
            <Text style={[premium.type.caption, { color: colors.muted }]}>
              {goal !== null
                ? `of ${(goal / 1000).toLocaleString()} L daily goal`
                : 'Daily water goal not set'}
            </Text>
          </View>
          <Button title="Log" icon={Plus} size="sm" variant="secondary" onPress={onOpen} />
        </View>
        <ProgressBar
          value={progressRatio(value, goal)}
          color={colors.sky}
          height={6}
          accessibilityLabel={
            value !== null && goal !== null
              ? `Water: ${value} of ${goal} millilitres`
              : 'Water progress unavailable'
          }
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copy: { flex: 1, gap: 2 },
  value: { ...premium.type.metric },
});
