import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '../../../shared/components/ui/Skeleton';
import { useTheme } from '@/hooks/use-theme';

export function HomeSkeleton() {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {/* Hero card skeleton */}
      <View style={[styles.heroCard, { backgroundColor: colors.surface2 }]}>
        <Skeleton width={96} height={12} radius={6} />
        <View style={styles.heroRow}>
          <Skeleton width={108} height={108} radius={54} />
          <View style={styles.heroTextCol}>
            <Skeleton width="75%" height={20} radius={6} />
            <Skeleton width="33%" height={20} radius={6} />
          </View>
        </View>
        <View style={styles.heroLines}>
          <Skeleton width="100%" height={12} radius={6} />
          <Skeleton width="83%" height={12} radius={6} />
        </View>
        <Skeleton width="100%" height={52} radius={16} />
      </View>

      {/* Repeating section skeletons */}
      {[0, 1].map((key) => (
        <View key={key} style={styles.section}>
          <Skeleton width={128} height={16} radius={6} style={{ marginBottom: 12 }} />
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <Skeleton width="50%" height={24} radius={6} />
            <Skeleton width="66%" height={14} radius={6} />
            <Skeleton width="100%" height={64} radius={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 28,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    gap: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  heroTextCol: {
    flex: 1,
    gap: 10,
  },
  heroLines: {
    gap: 8,
  },
  section: {
    marginTop: 8,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
});

