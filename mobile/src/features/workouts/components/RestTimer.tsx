import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ProgressRing } from '../../../shared/components/charts/ProgressRing';
import { useTheme } from '@/hooks/use-theme';

type RestTimerProps = {
  remaining: number;
  total: number;
  nextLabel: string;
  onAdd: () => void;
  onSkip: () => void;
};

export function RestTimer({
  remaining,
  total,
  nextLabel,
  onAdd,
  onSkip,
}: RestTimerProps) {
  const { colors } = useTheme();
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.hero,
        },
      ]}
    >
      <ProgressRing
        size={58}
        strokeWidth={5}
        value={total > 0 ? remaining / total : 0}
        color={colors.accent}
        trackColor={`${colors.heroInk}20`}
      >
        <Text style={[styles.timerDigits, { color: colors.heroInk }]}>
          {mm}:{ss}
        </Text>
      </ProgressRing>

      <View style={styles.textCol}>
        <Text style={[styles.title, { color: colors.heroInk }]}>Rest</Text>
        <Text
          style={[styles.nextLabel, { color: colors.heroMuted }]}
          numberOfLines={1}
        >
          Next: {nextLabel}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onAdd}
        style={[styles.addBtn, { backgroundColor: `${colors.heroInk}15` }]}
      >
        <Text style={[styles.addBtnText, { color: colors.heroInk }]}>+15s</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onSkip}
        style={[styles.skipBtn, { backgroundColor: colors.accent }]}
      >
        <Text style={[styles.skipBtnText, { color: colors.accentInk }]}>Skip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    padding: 14,
    gap: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  timerDigits: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  nextLabel: {
    fontSize: 12.5,
    marginTop: 2,
  },
  addBtn: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  skipBtn: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

