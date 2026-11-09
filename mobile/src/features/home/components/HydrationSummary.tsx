import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Droplets, Plus } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { ActionButton } from '@/shared/components/ui/ActionButton';
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
      <SectionHeader title="Stay hydrated" appearance="premium" />
      <View
        style={[styles.content, { borderTopColor: colors.line, borderBottomColor: colors.line }]}
      >
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: colors.infoLight }]}>
            <Droplets size={22} color={colors.info} strokeWidth={1.7} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.value, { color: colors.ink }]}>
              {value === null
                ? '—'
                : (value / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <Text style={[premium.type.body, { color: colors.muted }]}> L</Text>
            </Text>
            <Text style={[premium.type.caption, { color: colors.muted }]}>
              {goal !== null
                ? `of ${(goal / 1000).toLocaleString()} L daily goal`
                : 'Daily water goal not set'}
            </Text>
          </View>
        </View>
        <ProgressBar
          value={progressRatio(value, goal)}
          color={colors.sky}
          height={5}
          accessibilityLabel={
            value !== null && goal !== null
              ? `Water: ${value} of ${goal} millilitres`
              : 'Water progress unavailable'
          }
        />
        <ActionButton variant="secondary" title="Log water" icon={Plus} onPress={onOpen} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 20,
    gap: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: premium.radius.control,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copy: { flex: 1, gap: 4 },
  value: { ...premium.type.metric, fontSize: 30, lineHeight: 38 },
});
