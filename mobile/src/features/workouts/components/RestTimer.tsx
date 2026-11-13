import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';

type Props = {
  remaining: number;
  total: number;
  nextLabel: string;
  onAdd: () => void;
  onSkip: () => void;
};
/** In-flow rest controls never cover the session completion action. */
export function RestTimer({ remaining, total, nextLabel, onAdd, onSkip }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.hero }]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[premium.type.caption, { color: colors.heroMuted }]}>
            REST · NEXT: {nextLabel}
          </Text>
        </View>
        <Text
          accessibilityLabel={`${remaining} seconds rest remaining`}
          style={[premium.type.metric, { color: colors.heroInk }]}
        >
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </Text>
      </View>
      <ProgressBar
        value={total > 0 ? remaining / total : 0}
        height={3}
        color={colors.highlight}
        trackColor="rgba(255,255,255,0.12)"
      />
      <View style={styles.row}>
        <ActionButton
          title="Add 15 seconds"
          variant="inverse"
          onPress={onAdd}
          style={styles.copy}
        />
        <ActionButton title="Skip rest" onPress={onSkip} style={styles.copy} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: premium.radius.card, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
});
