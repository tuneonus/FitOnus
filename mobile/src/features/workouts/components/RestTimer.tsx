import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { Reveal } from '@/shared/components/ui/Reveal';

/** The rest clock ticks once a second, so the bar takes a second to cover each step. */
const REST_TICK_MS = 1000;

type Props = {
  remaining: number;
  total: number;
  nextLabel: string;
  onAdd: () => void;
  onSkip: () => void;
};
/**
 * In-flow rest controls never cover the session completion action. The card rises in when a set starts the rest and
 * fades out when the rest ends or is skipped; its bar starts full and drains at a constant speed, so the once-a-second
 * updates read as one continuous glide rather than steps.
 */
export function RestTimer({ remaining, total, nextLabel, onAdd, onSkip }: Props) {
  const { colors } = useTheme();
  return (
    <Reveal exit style={[styles.card, { backgroundColor: colors.hero }]}>
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
        animateOnMount={false}
        linear
        tweenMs={REST_TICK_MS}
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
    </Reveal>
  );
}
const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: premium.radius.card, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
});
