import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export function HomeSkeleton() {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="Loading today’s nutrition"
      accessibilityState={{ busy: true }}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={styles.content}
      >
        <Skeleton width={96} height={14} radius={4} />
        <View style={styles.row}>
          <View style={styles.text}>
            <Skeleton width="85%" height={52} radius={6} />
            <Skeleton width="75%" height={14} radius={4} />
          </View>
          <Skeleton width={112} height={112} radius={56} />
        </View>
        <Skeleton width="65%" height={18} radius={4} />
        <View style={styles.row}>
          {[0, 1, 2].map((key) => (
            <View key={key} style={styles.text}>
              <Skeleton width="65%" height={14} radius={4} />
              <Skeleton width="80%" height={28} radius={4} />
              <Skeleton width="100%" height={3} radius={2} />
              <Skeleton width="70%" height={12} radius={4} />
            </View>
          ))}
        </View>
        <Skeleton width="75%" height={12} radius={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: premium.radius.hero, padding: 20 },
  content: { gap: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  text: { flex: 1, gap: 12 },
});
